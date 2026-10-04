import { atomicConversation } from "./atomicConversation.js";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { ChatToolId } from "@Ken/shared";
import { AppError } from "../../utils/AppError.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { findOwnedConversation, titleFromContent, capStoredTurns, conversationExpiry, synchronizeConversationRetention } from "./conversationService.js";
import { getAccessibleGpt } from "../gpts/gptService.js";
import {
  copyMessageAttachments,
  loadOwnedFiles,
  publicAttachmentsForMessages,
} from "../storage/fileService.js";
import { modelRegistry } from "../ai/ModelRegistry.js";
import { prepareTurn } from "./prepareTurn.js";
import { toPublicConversation, toPublicMessage } from "./toPublic.js";
import type { PreparedGeneration } from "./generationTypes.js";
import {
  applyThreadSelection,
  asRecord,
  finishPreparedGeneration,
  persistFilesOnMessage,
  persistGeneratedFiles,
  streamingAssistantFields,
} from "./prepareHelpers.js";

export async function prepareSend(input: {
  userId: string;
  content: string;
  conversationId?: string;
  providerId?: string;
  modelId?: string;
  attachmentIds?: string[];
  enabledTools?: ChatToolId[];
  customGptId?: string;
  abortSignal?: AbortSignal;
  generationId?: string;
}): Promise<PreparedGeneration> {
  // Routing below reads the model list; loading it now overlaps that read
  // with the conversation lookup instead of queueing behind it.
  modelRegistry.prefetch(input.userId);
  const conversation = input.conversationId
    ? await findOwnedConversation(input.userId, input.conversationId)
    : null;

  const requestedProviderId = input.providerId ?? conversation?.providerId;
  const requestedModelId = input.modelId ?? conversation?.modelId;
  if (!requestedProviderId || !requestedModelId) {
    throw new AppError("A model is required", { statusCode: 400, code: "VALIDATION_ERROR" });
  }

  const customGptId = input.customGptId ?? (conversation?.customGptId ? String(conversation.customGptId) : undefined);
  if (customGptId) {
    await getAccessibleGpt(input.userId, customGptId);
  }

  const earlyIds = input.attachmentIds ?? [];
  const earlyFiles = earlyIds.length > 0 ? await loadOwnedFiles(input.userId, earlyIds) : [];
  const turn = await prepareTurn({
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    ...(earlyFiles.some(isGeneratedImage) ? { skipImageIntent: true } : {}),
    userId: input.userId,
    content: input.content,
    providerId: requestedProviderId,
    modelId: requestedModelId,
    files: earlyFiles,
    ...(input.enabledTools ? { enabledTools: input.enabledTools } : {}),
  });

  // Preparation can spend a long time in tools; nothing is written for a turn
  // the user already stopped.
  input.abortSignal?.throwIfAborted();
  const titleFile = earlyFiles[0] ?? turn.generatedFiles[0];
  const titleSource = input.content.trim() || titleFile?.originalName || "New chat";
  const expiresAt = conversationExpiry(false);
  const owned =
    conversation ??
    (await Conversation.create({
      userId: input.userId,
      title: titleFromContent(titleSource),
      // Written explicitly rather than left to the schema default, so only
      // conversations created since this field existed are ever auto-renamed.
      // A chat from before it hydrates with no value and is left alone.
      titleSource: "auto",
      // The thread stores the sentinel, so its next turn stays on Auto.
      modelId: turn.threadModelId,
      providerId: turn.threadProviderId,
      archived: false,
      pinned: false,
      messageCount: 0,
      ...(expiresAt ? { expiresAt } : {}),
      ...(customGptId ? { customGptId } : {}),
    }));

  applyThreadSelection(owned, turn);
  if (customGptId) {
    owned.customGptId = new mongoose.Types.ObjectId(customGptId);
  }
  const renewsExpiry = Boolean(conversation) && !owned.pinned;
  if (!owned.pinned) {
    owned.set("expiresAt", conversationExpiry(false));
  }

  const generationId = input.generationId ?? randomUUID();
  const userOid = new mongoose.Types.ObjectId();
  const assistantOid = new mongoose.Types.ObjectId();
  owned.messageCount = (owned.messageCount ?? 0) + 2;
  owned.lastMessageAt = new Date();
  owned.lastMessagePreview = (input.content || titleFile?.originalName || "Attachment").slice(0, 280);
  if (owned.title === "New chat") {
    owned.title = titleFromContent(titleSource);
  }

  // One round trip, not two: the conversation's own save does not depend on
  // either message, and every one of these sits in front of the first token.
  const [userDoc, assistantDoc] = await Promise.all([
    Message.create({
      _id: userOid,
      conversationId: owned._id,
      userId: input.userId,
      role: "user" as const,
      content: input.content,
      status: "complete" as const,
      ...(owned.expiresAt ? { expiresAt: owned.expiresAt } : {}),
    }),
    Message.create(streamingAssistantFields({
      _id: assistantOid,
      conversationId: owned._id,
      userId: input.userId,
      parentMessageId: userOid,
      generationId,
      turn,
      expiresAt: owned.expiresAt,
    })),
    owned.save(),
    // Activity renews the thread's expiry. Earlier turns move with it, or they
    // expire underneath a conversation that is still alive.
    renewsExpiry
      ? synchronizeConversationRetention(String(owned._id), input.userId, owned.expiresAt)
      : Promise.resolve(),
  ]);

  const userAttachments = await persistFilesOnMessage({
    userId: input.userId,
    conversationId: String(owned._id),
    messageId: String(userDoc._id),
    files: earlyFiles,
    doc: userDoc,
  });
  const assistantAttachments = await persistGeneratedFiles(input.userId, String(owned._id), assistantDoc, turn);
  void capStoredTurns(String(owned._id), input.userId);

  return finishPreparedGeneration({
    turn,
    userId: input.userId,
    conversationId: String(owned._id),
    generationId,
    userMessage: toPublicMessage(userDoc, userAttachments),
    assistantMessage: toPublicMessage(assistantDoc, assistantAttachments),
    conversation: toPublicConversation(owned),
    ...(customGptId ? { customGptId } : {}),
  }, input.abortSignal);
}

/**
 * Re-asks one of the user's own turns with new wording, at the end of the thread.
 *
 * Nothing is rewritten and nothing is discarded. The revised question is
 * appended as a fresh user turn carrying `editedFromMessageId`, and the reply
 * is generated against the whole conversation, so a correction late in a long
 * thread keeps every exchange that came before it. Truncating here — which is
 * what supersede-everything-after used to do — threw away work the user could
 * not get back, and made an edit near the top of a thread look like the chat
 * had been wiped.
 */
export async function prepareEdit(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  content: string;
  providerId?: string;
  modelId?: string;
  abortSignal?: AbortSignal;
  generationId?: string;
}): Promise<PreparedGeneration> {
  const conversation = await findOwnedConversation(input.userId, input.conversationId);
  if (!mongoose.isValidObjectId(input.messageId)) {
    throw new AppError("Message not found", { statusCode: 404, code: "MESSAGE_NOT_FOUND" });
  }

  const target = await Message.findOne({
    _id: input.messageId,
    conversationId: conversation._id,
    userId: input.userId,
  });
  if (!target) {
    throw new AppError("Message not found", { statusCode: 404, code: "MESSAGE_NOT_FOUND" });
  }
  if (target.role !== "user") {
    throw new AppError("Only your own messages can be edited", {
      statusCode: 400,
      code: "EDIT_UNAVAILABLE",
    });
  }
  if (asRecord(target.metadata)?.["superseded"] === true) {
    throw new AppError("This message is no longer part of the conversation", {
      statusCode: 400,
      code: "EDIT_UNAVAILABLE",
    });
  }

  const attachmentMap = await publicAttachmentsForMessages([String(target._id)]);
  const existingAttachments = attachmentMap.get(String(target._id)) ?? [];
  const selectedProviderId = input.providerId ?? conversation.providerId;
  const selectedModelId = input.modelId ?? conversation.modelId;
  const turn = await prepareTurn({
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    userId: input.userId,
    content: input.content,
    providerId: selectedProviderId,
    modelId: selectedModelId,
    files: existingAttachments,
  });
  input.abortSignal?.throwIfAborted();
  // Validation and tools ran above, so a failure there writes nothing. The
  // revised turn, its attachments, the reply placeholder and the counters
  // commit together or not at all.
  const persisted = await atomicConversation(async () => {
  const current = await findOwnedConversation(input.userId, input.conversationId);
  await assertStillActive(target._id, current._id, input.userId);
  const generationId = input.generationId ?? randomUUID();
  const userDoc = await Message.create({
    conversationId: current._id,
    userId: input.userId,
    role: "user",
    content: input.content,
    status: "complete",
    metadata: {
      edited: true,
      editedAt: new Date().toISOString(),
      editedFromMessageId: String(target._id),
    },
    ...(current.expiresAt ? { expiresAt: current.expiresAt } : {}),
  });

  // The model only sees files hanging off the newest user turn, so a reworded
  // question about an uploaded document has to bring that document with it.
  const attachments = await copyMessageAttachments({
    sourceMessageId: String(target._id),
    targetMessageId: String(userDoc._id),
  });
  if (attachments.length > 0) {
    userDoc.attachments = attachments.map((item) => new mongoose.Types.ObjectId(item.id));
    await userDoc.save();
  }

  applyThreadSelection(current, turn);

  const assistantDoc = await Message.create(
    streamingAssistantFields({
      conversationId: current._id,
      userId: input.userId,
      parentMessageId: userDoc._id,
      generationId,
      turn,
      expiresAt: current.expiresAt,
    }),
  );
  current.messageCount = (current.messageCount ?? 0) + 2;
  current.lastMessageAt = new Date();
  current.lastMessagePreview = input.content.slice(0, 280);
  await current.save();

  const assistantAttachments = await persistGeneratedFiles(
    input.userId,
    String(current._id),
    assistantDoc,
    turn,
  );

  return {
    turn,
    userId: input.userId,
    conversationId: String(current._id),
    generationId,
    userMessage: toPublicMessage(userDoc, attachments),
    assistantMessage: toPublicMessage(assistantDoc, assistantAttachments),
    conversation: toPublicConversation(current),
    ...(current.customGptId ? { customGptId: String(current.customGptId) } : {}),
  };
  });
  return finishPreparedGeneration(persisted, input.abortSignal);
}

export async function prepareRegenerate(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  providerId?: string;
  modelId?: string;
  abortSignal?: AbortSignal;
  generationId?: string;
}): Promise<PreparedGeneration> {
  const conversation = await findOwnedConversation(input.userId, input.conversationId);
  if (!mongoose.isValidObjectId(input.messageId)) {
    throw new AppError("Message not found", { statusCode: 404, code: "MESSAGE_NOT_FOUND" });
  }

  const target = await Message.findOne({
    _id: input.messageId,
    conversationId: conversation._id,
    userId: input.userId,
  });
  if (!target) {
    throw new AppError("Message not found", { statusCode: 404, code: "MESSAGE_NOT_FOUND" });
  }

  const userMessage =
    target.role === "user"
      ? target
      : target.parentMessageId
        ? await Message.findOne({ _id: target.parentMessageId, conversationId: conversation._id, userId: input.userId })
        : await Message.findOne({
            conversationId: conversation._id,
            userId: input.userId,
            role: "user",
            createdAt: { $lt: target.createdAt },
          }).sort({ createdAt: -1, _id: -1 });

  if (!userMessage || userMessage.role !== "user") {
    throw new AppError("Cannot regenerate this message", { statusCode: 400, code: "REGENERATE_UNAVAILABLE" });
  }

  const attachmentMap = await publicAttachmentsForMessages([String(userMessage._id)]);
  const existingAttachments = attachmentMap.get(String(userMessage._id)) ?? [];
  const selectedProviderId = input.providerId ?? conversation.providerId;
  const selectedModelId = input.modelId ?? conversation.modelId;
  const turn = await prepareTurn({
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    userId: input.userId,
    content: userMessage.content ?? "",
    providerId: selectedProviderId,
    modelId: selectedModelId,
    files: existingAttachments,
  });
  input.abortSignal?.throwIfAborted();
  // Nothing is superseded until a replacement exists, so a failed preparation
  // above leaves the old answer and everything after it visible. A concurrent
  // regenerate of the same branch conflicts here instead of silently winning.
  const persisted = await atomicConversation(async () => {
  const current = await findOwnedConversation(input.userId, input.conversationId);
  await assertStillActive(target._id, current._id, input.userId);
  if (!userMessage._id.equals(target._id)) {
    await assertStillActive(userMessage._id, current._id, input.userId);
  }
  applyThreadSelection(current, turn);

  const generationId = input.generationId ?? randomUUID();
  const assistantDoc = await Message.create(
    streamingAssistantFields({
      conversationId: current._id,
      userId: input.userId,
      parentMessageId: userMessage._id,
      generationId,
      turn,
      expiresAt: current.expiresAt,
    }),
  );
  current.messageCount = (current.messageCount ?? 0) + 1;
  await current.save();
  const assistantAttachments = await persistGeneratedFiles(
    input.userId,
    String(current._id),
    assistantDoc,
    turn,
  );

  // Regenerating is a branch, not an append: every turn after the target
  // answered a reply that is about to be replaced, so keeping them would leave
  // the thread reading as a conversation that never happened and would feed the
  // model a history contradicting the answer it is being asked to redo. The
  // target itself goes only when it is the assistant turn being replaced —
  // regenerating from a user turn keeps that question and discards what followed.
  //
  // Ordering compares on createdAt with _id as the tie-break, the same way
  // prepareEdit does: a user turn and its reply are often written in the same
  // millisecond, and a plain $gt would leave that reply behind.
  await Message.updateMany(
    {
      conversationId: current._id,
      userId: input.userId,
      _id: { $ne: assistantDoc._id },
      "metadata.superseded": { $ne: true },
      $or: [
        ...(target.role === "assistant" ? [{ _id: target._id }] : []),
        { createdAt: { $gt: target.createdAt } },
        { createdAt: target.createdAt, _id: { $gt: target._id } },
      ],
    },
    { $set: { "metadata.superseded": true } },
  );

  return {
    turn,
    userId: input.userId,
    conversationId: String(current._id),
    generationId,
    userMessage: toPublicMessage(userMessage, existingAttachments),
    assistantMessage: toPublicMessage(assistantDoc, assistantAttachments),
    conversation: toPublicConversation(current),
    ...(current.customGptId ? { customGptId: String(current.customGptId) } : {}),
  };
  });
  return finishPreparedGeneration(persisted, input.abortSignal);
}

/** A picture Ken generated (toolbar or chat), as opposed to a user upload. */
function isGeneratedImage(file: { metadata?: unknown }): boolean {
  return Boolean(asRecord(asRecord(file.metadata)?.["generatedBy"]));
}

/**
 * Re-read inside the transaction. A turn that another edit or regenerate has
 * already superseded is a lost race, so the caller gets a retryable 409 rather
 * than a second branch silently replacing the first.
 */
async function assertStillActive(
  messageId: mongoose.Types.ObjectId,
  conversationId: mongoose.Types.ObjectId,
  userId: string,
): Promise<void> {
  const active = await Message.exists({
    _id: messageId,
    conversationId,
    userId,
    "metadata.superseded": { $ne: true },
  });
  if (!active) {
    throw new AppError("This conversation changed while your request was being prepared. Please try again.", {
      statusCode: 409,
      code: "CONVERSATION_CONFLICT",
      expose: true,
    });
  }
}
