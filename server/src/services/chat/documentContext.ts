import mongoose from "mongoose";
import { logger } from "../../config/logger.js";
import { Message } from "../../models/Message.js";
import { toSafeError } from "../../utils/redact.js";
import { telemetry } from "../../utils/telemetry.js";
import { documentSectionsFor } from "../storage/documentIndex.js";
import { isExtractableDocumentMime } from "../storage/extractDocument.js";
import { getOwnedFile, publicAttachmentsForMessages } from "../storage/fileService.js";
import { documentCharBudget } from "./ContextManager.js";
import { formatDocumentSections, isRelevantFollowUp, selectSections } from "./documentSections.js";

/**
 * Document text a follow-up turn may carry. Well under a turn's full document
 * budget: the question is about part of a file the user has already seen, so a
 * few relevant sections answer it without resending the whole thing.
 */
export const FOLLOW_UP_DOCUMENT_CHARS = 10_000;

/** Most recent distinct documents searched on a follow-up. */
const MAX_EARLIER_DOCUMENTS = 3;
/** How far back to look for them, in user turns. */
const LOOKBACK_USER_TURNS = 30;

/**
 * The relevant sections of documents attached earlier in the conversation,
 * formatted to append to the current question — or undefined when there are
 * none, or none this question is about.
 *
 * Before this, a document reached the model only on the turn it was attached;
 * every later turn saw "(Previously attached: file.pdf)" and nothing else.
 */
export async function earlierDocumentContext(input: {
  userId: string;
  conversationId: string;
  /** The question being answered; its own attachments are already on it. */
  currentMessageId?: string;
  question: string;
  providerId: string;
}): Promise<string | undefined> {
  if (!mongoose.isValidObjectId(input.conversationId)) return undefined;
  const excludeCurrent =
    input.currentMessageId && mongoose.isValidObjectId(input.currentMessageId)
      ? { _id: { $ne: new mongoose.Types.ObjectId(input.currentMessageId) } }
      : {};
  const earlierTurns = await Message.find({
    conversationId: input.conversationId,
    userId: input.userId,
    role: "user",
    "metadata.superseded": { $ne: true },
    ...excludeCurrent,
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(LOOKBACK_USER_TURNS)
    .select({ _id: 1 })
    .lean();
  if (earlierTurns.length === 0) return undefined;

  const attachmentMap = await publicAttachmentsForMessages(earlierTurns.map((turn) => String(turn._id)));
  const fileIds: string[] = [];
  for (const turn of earlierTurns) {
    for (const attachment of attachmentMap.get(String(turn._id)) ?? []) {
      if (isExtractableDocumentMime(attachment.mimeType) && !fileIds.includes(attachment.fileId)) {
        fileIds.push(attachment.fileId);
      }
    }
  }
  if (fileIds.length === 0) return undefined;

  const relevant: Array<{ name: string; sections: string[] }> = [];
  for (const fileId of fileIds.slice(0, MAX_EARLIER_DOCUMENTS)) {
    // A file deleted since it was attached is simply skipped.
    const file = await getOwnedFile(input.userId, fileId).catch(() => undefined);
    if (!file) continue;
    const sections = await documentSectionsFor(file);
    if (isRelevantFollowUp(sections, input.question)) relevant.push({ name: file.originalName, sections });
  }
  if (relevant.length === 0) return undefined;

  const budget = Math.floor(Math.min(FOLLOW_UP_DOCUMENT_CHARS, documentCharBudget(input.providerId)) / relevant.length);
  const blocks = relevant.map(({ name, sections }) =>
    formatDocumentSections(name, sections, selectSections(sections, input.question, budget), { earlier: true }),
  );
  logger.info(
    telemetry({
      event: "earlier_document_context",
      conversationId: input.conversationId,
      documents: relevant.length,
      chars: blocks.reduce((sum, block) => sum + block.length, 0),
    }),
    "earlier document sections added",
  );
  return blocks.join("\n\n");
}

/** earlierDocumentContext that never throws: a failed lookup must not fail the reply. */
export async function safeEarlierDocumentContext(
  input: Parameters<typeof earlierDocumentContext>[0],
): Promise<string | undefined> {
  try {
    return await earlierDocumentContext(input);
  } catch (error) {
    logger.warn({ err: toSafeError(error), conversationId: input.conversationId }, "earlier document lookup failed");
    return undefined;
  }
}
