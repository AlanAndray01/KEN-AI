import type { PublicMessage } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { toSafeError } from "../../utils/redact.js";
import type { ChatMessage } from "../ai/AIProvider.js";
import { Message } from "../../models/Message.js";
import { documentCharBudget, MAX_HISTORY_MESSAGES } from "./ContextManager.js";
import { foldInlineDocuments } from "./documentParts.js";
import { activeSummary, messagesAfter, summaryMessage } from "./conversationSummary.js";
import {
  loadOwnedFiles,
  materializeFilesForModel,
  providerSupportsNativeDocuments,
  publicAttachmentsForMessages,
} from "../storage/fileService.js";

/**
 * The model's view of the thread: the rolling summary of older turns (when one
 * exists) followed by the turns after it, newest window only.
 */
export async function loadHistory(userId: string, conversationId: string): Promise<ChatMessage[]> {
  // The summary is an optimisation. If reading it fails, the turn is built from
  // the recent messages alone, as it was before summaries existed.
  const summary = await activeSummary(userId, conversationId).catch((error: unknown) => {
    logger.warn({ err: toSafeError(error), conversationId }, "conversation summary lookup failed");
    return undefined;
  });
  const newestFirst = await Message.find({
    conversationId,
    userId,
    role: { $in: ["user", "assistant", "system"] },
    "metadata.superseded": { $ne: true },
    status: { $in: ["complete", "aborted", "streaming"] },
    ...(summary ? messagesAfter(summary) : {}),
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_HISTORY_MESSAGES);
  const docs = [...newestFirst].reverse();

  // Attachments are named here, never unpacked. The current question's files
  // are prepared once, by currentUserTurn, and swapped in by withCurrentUser;
  // earlier files reach the model as their relevant sections through
  // earlierDocumentContext. Unpacking here as well is what could send the
  // previous turn's whole document again when the new turn was not yet saved.
  const attachmentMap = await publicAttachmentsForMessages(docs.map((doc) => String(doc._id)));

  const result: ChatMessage[] = [];
  for (const doc of docs) {
    if (!doc.content && doc.role !== "user") continue;
    const attachments = attachmentMap.get(String(doc._id)) ?? [];
    const names = attachments.map((item) => item.originalName).join(", ");
    const content = doc.content ?? "";
    result.push({
      role: doc.role as ChatMessage["role"],
      content: names ? [content, `(Previously attached: ${names})`].filter(Boolean).join("\n") : content,
      sourceId: String(doc._id),
    });
  }
  return summary ? [summaryMessage(summary.text), ...result] : result;
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
    return { role: "user", content: userMessage.content, sourceId: userMessage.id };
  }
  const files = await loadOwnedFiles(userId, fileIds);
  const nativeDocuments = providerId ? providerSupportsNativeDocuments(providerId) : false;
  const materialized = await materializeFilesForModel(files, {
    nativeDocuments,
    question: userMessage.content,
    ...(providerId ? { charBudget: documentCharBudget(providerId) } : {}),
  });
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
  return { ...(folded ?? { role: "user", content: userMessage.content }), sourceId: userMessage.id };
}

export function withCurrentUser(history: ChatMessage[], current: ChatMessage): ChatMessage[] {
  const last = history.at(-1);
  if (last?.role !== "user") return [...history, current];
  // The saved copy of this very question: replace it with the prepared one,
  // which carries the attachments and any earlier-document sections.
  if (current.sourceId && last.sourceId === current.sourceId) return [...history.slice(0, -1), current];
  if (last.content === current.content) {
    if (current.parts?.length && !last.parts?.length) {
      return [...history.slice(0, -1), current];
    }
    return history;
  }
  return [...history, current];
}
