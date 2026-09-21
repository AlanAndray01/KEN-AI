import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { ChatToolId } from "@Ken/shared";
import { AppError } from "../../utils/AppError.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { findOwnedConversation, titleFromContent, capStoredTurns, conversationExpiry } from "./conversationService.js";
import { getAccessibleGpt } from "../gpts/gptService.js";
import {
  copyMessageAttachments,
  loadOwnedFiles,
  publicAttachmentsForMessages,
} from "../storage/fileService.js";
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
}): Promise<PreparedGeneration> {
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
    userId: input.userId,
    content: input.content,
    providerId: requestedProviderId,
    modelId: requestedModelId,
    files: earlyFiles,
    ...(input.enabledTools ? { enabledTools: input.enabledTools } : {}),
  });

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
  if (!owned.pinned) {
    owned.set("expiresAt", conversationExpiry(false));
  }

  const generationId = randomUUID();
  const userOid = new mongoose.Types.ObjectId();
  const assistantOid = new mongoose.Types.ObjectId();
  owned.messageCount = (owned.messageCount ?? 0) + 2;
  owned.lastMessageAt = new Date();
  owned.lastMessagePreview = (input.content || titleFile?.originalName || "Attachment").slice(0, 280);
  if (owned.title === "New chat") {
    owned.title = titleFromContent(titleSource);
  }

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
  ]);
  await owned.save();

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
  });
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

  const generationId = randomUUID();
  const userDoc = await Message.create({
    conversationId: conversation._id,
    userId: input.userId,
    role: "user",
    content: input.content,
    status: "complete",
    metadata: {
      edited: true,
      editedAt: new Date().toISOString(),
      editedFromMessageId: String(target._id),
    },
    ...(conversation.expiresAt ? { expiresAt: conversation.expiresAt } : {}),
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

  const selectedProviderId = input.providerId ?? conversation.providerId;
  const selectedModelId = input.modelId ?? conversation.modelId;
  const turn = await prepareTurn({
    userId: input.userId,
    content: input.content,
    providerId: selectedProviderId,
    modelId: selectedModelId,
    files: attachments,
  });
  applyThreadSelection(conversation, turn);

  const assistantDoc = await Message.create(
    streamingAssistantFields({
      conversationId: conversation._id,
      userId: input.userId,
      parentMessageId: userDoc._id,
      generationId,
      turn,
      expiresAt: conversation.expiresAt,
    }),
  );
  conversation.messageCount = (conversation.messageCount ?? 0) + 2;
  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = input.content.slice(0, 280);
  await conversation.save();

  const assistantAttachments = await persistGeneratedFiles(
    input.userId,
    String(conversation._id),
    assistantDoc,
    turn,
  );

  return finishPreparedGeneration({
    turn,
    userId: input.userId,
    conversationId: String(conversation._id),
    generationId,
    userMessage: toPublicMessage(userDoc, attachments),
    assistantMessage: toPublicMessage(assistantDoc, assistantAttachments),
    conversation: toPublicConversation(conversation),
    ...(conversation.customGptId ? { customGptId: String(conversation.customGptId) } : {}),
  });
}

export async function prepareRegenerate(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  providerId?: string;
  modelId?: string;
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
      conversationId: conversation._id,
      userId: input.userId,
      "metadata.superseded": { $ne: true },
      $or: [
        ...(target.role === "assistant" ? [{ _id: target._id }] : []),
        { createdAt: { $gt: target.createdAt } },
        { createdAt: target.createdAt, _id: { $gt: target._id } },
      ],
    },
    { $set: { "metadata.superseded": true } },
  );

  const attachmentMap = await publicAttachmentsForMessages([String(userMessage._id)]);
  const existingAttachments = attachmentMap.get(String(userMessage._id)) ?? [];
  const selectedProviderId = input.providerId ?? conversation.providerId;
  const selectedModelId = input.modelId ?? conversation.modelId;
  const turn = await prepareTurn({
    userId: input.userId,
    content: userMessage.content ?? "",
    providerId: selectedProviderId,
    modelId: selectedModelId,
    files: existingAttachments,
  });
  applyThreadSelection(conversation, turn);

  const generationId = randomUUID();
  const assistantDoc = await Message.create(
    streamingAssistantFields({
      conversationId: conversation._id,
      userId: input.userId,
      parentMessageId: userMessage._id,
      generationId,
      turn,
    }),
  );
  conversation.messageCount = (conversation.messageCount ?? 0) + 1;
  await conversation.save();
  const assistantAttachments = await persistGeneratedFiles(
    input.userId,
    String(conversation._id),
    assistantDoc,
    turn,
  );

  return finishPreparedGeneration({
    turn,
    userId: input.userId,
    conversationId: String(conversation._id),
    generationId,
    userMessage: toPublicMessage(userMessage, existingAttachments),
    assistantMessage: toPublicMessage(assistantDoc, assistantAttachments),
    conversation: toPublicConversation(conversation),
    ...(conversation.customGptId ? { customGptId: String(conversation.customGptId) } : {}),
  });
}
