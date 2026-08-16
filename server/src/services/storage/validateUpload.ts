import path from "node:path";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from "@aether/shared";
import type { PublicFile } from "@aether/shared";
import { AppError } from "../../utils/AppError.js";

export type FileKind = PublicFile["kind"];

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv", "application/json"]);
const ALLOWED = new Set<string>(ALLOWED_UPLOAD_MIME_TYPES);

const EXTENSION_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".csv": "text/csv",
  ".json": "application/json",
};

export function kindForMime(mimeType: string): FileKind {
  if (IMAGE_MIMES.has(mimeType)) return "image";
  if (mimeType === "application/pdf" || TEXT_MIMES.has(mimeType)) return "document";
  return "other";
}

export function isImageMime(mimeType: string): boolean {
  return IMAGE_MIMES.has(mimeType);
}

export function isTextMime(mimeType: string): boolean {
  return TEXT_MIMES.has(mimeType);
}

export function isPdfMime(mimeType: string): boolean {
  return mimeType === "application/pdf";
}

export function validateUploadBuffer(input: {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  maxBytes?: number;
}): { mimeType: string; kind: FileKind } {
  const maxBytes = input.maxBytes ?? MAX_UPLOAD_BYTES;
  if (input.buffer.length === 0) {
    throw new AppError("File is empty", { statusCode: 400, code: "FILE_EMPTY" });
  }
  if (input.buffer.length > maxBytes) {
    throw new AppError("File is too large", { statusCode: 413, code: "FILE_TOO_LARGE" });
  }

  const declared = normalizeMime(input.mimeType, input.originalName);
  const sniffed = sniffMime(input.buffer, input.originalName) ?? declared;
  if (!ALLOWED.has(sniffed)) {
    throw new AppError("File type is not allowed", { statusCode: 400, code: "FILE_TYPE_UNSUPPORTED" });
  }
  if (declared !== sniffed && ALLOWED.has(declared) && kindForMime(declared) !== kindForMime(sniffed)) {
    throw new AppError("File type does not match contents", { statusCode: 400, code: "FILE_TYPE_MISMATCH" });
  }

  if (IMAGE_MIMES.has(sniffed) || sniffed === "application/pdf") {
    const magicMime = sniffMime(input.buffer, input.originalName);
    if (magicMime && magicMime !== sniffed) {
      throw new AppError("File type does not match contents", { statusCode: 400, code: "FILE_TYPE_MISMATCH" });
    }
  }

  if (TEXT_MIMES.has(sniffed) && containsNul(input.buffer)) {
    throw new AppError("File type is not allowed", { statusCode: 400, code: "FILE_TYPE_UNSUPPORTED" });
  }

  return { mimeType: sniffed, kind: kindForMime(sniffed) };
}

export function extractTextDocument(buffer: Buffer, mimeType: string): string {
  if (!isTextMime(mimeType)) return "";
  const text = buffer.toString("utf8");
  const maxChars = 100_000;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Truncated attached file]`;
}

function normalizeMime(mimeType: string, originalName: string): string {
  const lower = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (lower === "image/jpg") return "image/jpeg";
  if (lower && lower !== "application/octet-stream") return lower;
  const fromName = EXTENSION_MIME[path.extname(originalName).toLowerCase()];
  return fromName ?? lower;
}

function sniffMime(buffer: Buffer, originalName: string): string | undefined {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF87a") return "image/gif";
  if (buffer.length >= 6 && buffer.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return "application/pdf";
  }
  return EXTENSION_MIME[path.extname(originalName).toLowerCase()];
}

function containsNul(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  return sample.includes(0);
}
