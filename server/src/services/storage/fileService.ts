import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { ModelCapability, PublicAttachment, PublicFile } from "@aether/shared";
import { MAX_ATTACHMENTS_PER_MESSAGE } from "@aether/shared";
import { env } from "../../config/env.js";
import { Attachment } from "../../models/Attachment.js";
import { File as StoredFile } from "../../models/File.js";
import { AppError } from "../../utils/AppError.js";
import type { ChatContentPart } from "../ai/AIProvider.js";
import { storageService } from "./index.js";
import {
  extractTextDocument,
  isImageMime,
  isPdfMime,
  isTextMime,
  validateUploadBuffer,
} from "./validateUpload.js";

export function toPublicFile(doc: {
  id?: string;
  _id?: { toString(): string };
  originalName: string;
  mimeType: string;
  size: number;
  kind?: PublicFile["kind"] | null;
  status?: PublicFile["status"] | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): PublicFile {
  return {
    id: doc.id ?? String(doc._id),
    originalName: doc.originalName,
    mimeType: doc.mimeType,
    size: doc.size,
    kind: doc.kind ?? "other",
    status: doc.status ?? "uploaded",
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

export async function uploadUserFile(input: {
  userId: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<PublicFile> {
  const validated = validateUploadBuffer({
    originalName: input.originalName,
    mimeType: input.mimeType,
    buffer: input.buffer,
    maxBytes: env.FILE_MAX_BYTES,
  });
  const checksum = createHash("sha256").update(input.buffer).digest("hex");
  const key = `${input.userId}/${randomUUID()}`;
  const stored = await storageService.put({
    key,
    buffer: input.buffer,
    mimeType: validated.mimeType,
  });
  const doc = await StoredFile.create({
    userId: input.userId,
    originalName: input.originalName.slice(0, 512),
    mimeType: validated.mimeType,
    size: stored.size,
    storageProvider: storageService.provider,
    storageKey: stored.key,
    checksum,
    kind: validated.kind,
    status: "ready",
  });
  return toPublicFile(doc);
}

export async function listUserFiles(userId: string, limit = 40): Promise<PublicFile[]> {
  const docs = await StoredFile.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100));
  return docs.map((doc) => toPublicFile(doc));
}

export async function getOwnedFile(userId: string, fileId: string) {
  if (!mongoose.isValidObjectId(fileId)) {
    throw new AppError("File not found", { statusCode: 404, code: "FILE_NOT_FOUND" });
  }
  const doc = await StoredFile.findOne({ _id: fileId, userId });
  if (!doc) {
    throw new AppError("File not found", { statusCode: 404, code: "FILE_NOT_FOUND" });
  }
  return doc;
}

export async function readOwnedFile(userId: string, fileId: string): Promise<{ file: PublicFile; buffer: Buffer }> {
  const doc = await getOwnedFile(userId, fileId);
  const buffer = await storageService.get(doc.storageKey);
  return { file: toPublicFile(doc), buffer };
}

export async function deleteOwnedFile(userId: string, fileId: string): Promise<void> {
  const doc = await getOwnedFile(userId, fileId);
  await storageService.delete(doc.storageKey);
  await Attachment.deleteMany({ fileId: doc._id, userId });
  await doc.deleteOne();
}

export async function loadOwnedFiles(userId: string, fileIds: string[]) {
  if (fileIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw new AppError("Too many attachments", { statusCode: 400, code: "TOO_MANY_ATTACHMENTS" });
  }
  const unique = [...new Set(fileIds)];
  const docs = [];
  for (const id of unique) {
    docs.push(await getOwnedFile(userId, id));
  }
  return docs;
}

export function assertAttachmentsAllowed(capabilities: ModelCapability[], files: Array<{ mimeType: string; originalName: string }>): void {
  const vision = capabilities.includes("vision");
  const filesCapability = capabilities.includes("files");
  for (const file of files) {
    if (isImageMime(file.mimeType) && !vision) {
      throw new AppError("This model cannot analyze images. Choose a vision-capable model.", {
        statusCode: 400,
        code: "VISION_UNSUPPORTED",
      });
    }
    if (isPdfMime(file.mimeType) && !filesCapability && !vision) {
      throw new AppError("This model cannot read files. Choose a file-capable model.", {
        statusCode: 400,
        code: "FILES_UNSUPPORTED",
      });
    }
    if (!isImageMime(file.mimeType) && !isPdfMime(file.mimeType) && !isTextMime(file.mimeType)) {
      throw new AppError("File type is not allowed", { statusCode: 400, code: "FILE_TYPE_UNSUPPORTED" });
    }
  }
}

export async function materializeFilesForModel(files: Array<{
  originalName: string;
  mimeType: string;
  storageKey: string;
}>): Promise<{ contentSuffix: string; parts: ChatContentPart[] }> {
  const notes: string[] = [];
  const parts: ChatContentPart[] = [];

  for (const file of files) {
    const buffer = await storageService.get(file.storageKey);
    if (isTextMime(file.mimeType)) {
      const extracted = extractTextDocument(buffer, file.mimeType);
      notes.push(`Attached file: ${file.originalName}\n${extracted}`);
      continue;
    }
    parts.push({
      type: "inline",
      mimeType: file.mimeType,
      data: buffer.toString("base64"),
      filename: file.originalName,
    });
    notes.push(`Attached file: ${file.originalName}`);
  }

  return {
    contentSuffix: notes.join("\n\n"),
    parts,
  };
}

export async function attachFilesToMessage(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  files: Array<{
    _id: { toString(): string };
    originalName: string;
    mimeType: string;
    size: number;
    kind?: PublicFile["kind"] | null;
  }>;
}): Promise<PublicAttachment[]> {
  const created = await Attachment.insertMany(
    input.files.map((file) => ({
      userId: input.userId,
      fileId: file._id,
      conversationId: input.conversationId,
      messageId: input.messageId,
    })),
  );
  return created.map((doc, index) => {
    const file = input.files[index];
    return {
      id: String(doc._id),
      fileId: String(file?._id ?? doc.fileId),
      originalName: file?.originalName ?? "file",
      mimeType: file?.mimeType ?? "application/octet-stream",
      size: file?.size ?? 0,
      kind: file?.kind ?? "other",
    };
  });
}

export async function publicAttachmentsForMessages(
  messageIds: string[],
): Promise<Map<string, PublicAttachment[]>> {
  const result = new Map<string, PublicAttachment[]>();
  if (messageIds.length === 0) return result;

  const docs = await Attachment.find({ messageId: { $in: messageIds } });
  const fileIds = docs.map((doc) => doc.fileId);
  const files = await StoredFile.find({ _id: { $in: fileIds } });
  const fileMap = new Map(files.map((file) => [String(file._id), file]));

  for (const doc of docs) {
    const file = fileMap.get(String(doc.fileId));
    if (!file) continue;
    const list = result.get(String(doc.messageId)) ?? [];
    list.push({
      id: String(doc._id),
      fileId: String(file._id),
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      kind: file.kind ?? "other",
    });
    result.set(String(doc.messageId), list);
  }
  return result;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}
