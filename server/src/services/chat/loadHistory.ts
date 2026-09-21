import type { PublicMessage } from "@Ken/shared";
import type { ChatMessage } from "../ai/AIProvider.js";
import { Message } from "../../models/Message.js";
import { MAX_HISTORY_MESSAGES } from "./ContextManager.js";
import { foldInlineDocuments } from "./documentParts.js";
import {
  loadOwnedFiles,
  materializeFilesForModel,
  providerSupportsNativeDocuments,
  publicAttachmentsForMessages,
} from "../storage/fileService.js";

export async function loadHistory(userId: string, conversationId: string): Promise<ChatMessage[]> {
  const newestFirst = await Message.find({
    conversationId,
    userId,
    role: { $in: ["user", "assistant", "system"] },
    "metadata.superseded": { $ne: true },
    status: { $in: ["complete", "aborted", "streaming"] },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_HISTORY_MESSAGES);
  const docs = [...newestFirst].reverse();

  const attachmentMap = await publicAttachmentsForMessages(docs.map((doc) => String(doc._id)));
  const lastUserIndex = docs.reduce((found, doc, index) => (doc.role === "user" ? index : found), -1);
  const currentFileIds =
    lastUserIndex >= 0
      ? (attachmentMap.get(String(docs[lastUserIndex]?._id)) ?? []).map((item) => item.fileId)
      : [];
  const files = currentFileIds.length > 0 ? await loadOwnedFiles(userId, currentFileIds) : [];
  const fileMap = new Map(files.map((file) => [String(file._id), file]));

  const result: ChatMessage[] = [];
  for (const [index, doc] of docs.entries()) {
    if (!doc.content && doc.role !== "user") continue;
    const attachments = attachmentMap.get(String(doc._id)) ?? [];
    let content = doc.content ?? "";
    let parts: ChatMessage["parts"];
    if (index === lastUserIndex && attachments.length > 0) {
      const messageFiles = attachments
        .map((item) => fileMap.get(item.fileId))
        .filter((file): file is (typeof files)[number] => Boolean(file));
      if (messageFiles.length > 0) {
        const materialized = await materializeFilesForModel(messageFiles, {
          nativeDocuments: false,
        });
        const [folded] = foldInlineDocuments(
          [
            {
              role: "user",
              content: [content, materialized.contentSuffix].filter(Boolean).join("\n\n"),
              ...(materialized.parts.length > 0 ? { parts: materialized.parts } : {}),
            },
          ],
          { nativeDocuments: false },
        );
        content = folded?.content ?? content;
        if (folded?.parts?.length) {
          parts = folded.parts;
        }
      }
    } else if (attachments.length > 0) {
      const names = attachments.map((item) => item.originalName).join(", ");
      content = [content, `(Previously attached: ${names})`].filter(Boolean).join("\n");
    }
    result.push({
      role: doc.role as ChatMessage["role"],
      content,
      ...(parts ? { parts } : {}),
    });
  }
  return result;
}

export async function currentUserTurn(
  userId: string,
  userMessage: PublicMessage,
  generatedFileIds?: string[],
  providerId?: string,
): Promise<ChatMessage> {
  const fileIds = [
    ...(userMessage.attachments ?? []).map((item) => item.fileId),
    ...(generatedFileIds ?? []),
  ];
  if (fileIds.length === 0) {
    return { role: "user", content: userMessage.content };
  }
  const files = await loadOwnedFiles(userId, fileIds);
  const nativeDocuments = providerId ? providerSupportsNativeDocuments(providerId) : false;
  const materialized = await materializeFilesForModel(files, { nativeDocuments });
  const [folded] = foldInlineDocuments(
    [
      {
        role: "user",
        content: [userMessage.content, materialized.contentSuffix].filter(Boolean).join("\n\n"),
        ...(materialized.parts.length > 0 ? { parts: materialized.parts } : {}),
      },
    ],
    { nativeDocuments },
  );
  return folded ?? { role: "user", content: userMessage.content };
}

export function withCurrentUser(history: ChatMessage[], current: ChatMessage): ChatMessage[] {
  const last = history.at(-1);
  if (last?.role !== "user") return [...history, current];
  if (last.content === current.content) {
    if (current.parts?.length && !last.parts?.length) {
      return [...history.slice(0, -1), current];
    }
    return history;
  }
  return [...history, current];
}
