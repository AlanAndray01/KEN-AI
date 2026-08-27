import mongoose from "mongoose";
import type { z } from "zod";
import {
  CONVERSATION_TTL_SECONDS,
  MAX_STORED_MESSAGE_TURNS,
  type createConversationSchema,
  type patchConversationSchema,
} from "@Ken/shared";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { AppError } from "../../utils/AppError.js";
import { modelRegistry } from "../ai/ModelRegistry.js";
import { getAccessibleGpt } from "../gpts/gptService.js";
import { publicAttachmentsForMessages } from "../storage/fileService.js";
import { toPublicConversation, toPublicMessage } from "./toPublic.js";

type CreateConversationInput = z.infer<typeof createConversationSchema>;
type PatchConversationInput = z.infer<typeof patchConversationSchema>;

export function conversationExpiry(pinned: boolean): Date | undefined {
  if (pinned) return undefined;
  return new Date(Date.now() + CONVERSATION_TTL_SECONDS * 1000);
}

export async function capStoredTurns(conversationId: string, userId: string): Promise<void> {
  const maxDocs = MAX_STORED_MESSAGE_TURNS * 2;
  const count = await Message.countDocuments({ conversationId, userId });
  if (count <= maxDocs) return;
  const extra = count - maxDocs;
  const oldest = await Message.find({ conversationId, userId })
    .sort({ createdAt: 1 })
    .limit(extra)
    .select("_id");
  if (oldest.length === 0) return;
  await Message.deleteMany({ _id: { $in: oldest.map((doc) => doc._id) } });
}

export async function listConversations(
  userId: string,
  options: { archived?: boolean; limit?: number } = {},
) {
  const limit = Math.min(Math.max(options.limit ?? 40, 1), 100);
  const archived = options.archived ?? false;
  const docs = await Conversation.find({ userId, archived })
    .select("title modelId providerId archived pinned lastMessageAt lastMessagePreview messageCount customGptId createdAt updatedAt")
    .sort({ pinned: -1, updatedAt: -1 })
    .limit(limit);
  return docs.map((doc) => toPublicConversation(doc));
}

export async function createConversation(userId: string, input: CreateConversationInput) {
  await modelRegistry.assertModelAvailable(input.providerId, input.modelId, userId);
  let customGptId: string | undefined;
  if (input.customGptId) {
    await getAccessibleGpt(userId, input.customGptId);
    customGptId = input.customGptId;
  }
  const expiresAt = conversationExpiry(false);
  const created = await Conversation.create({
    userId,
    title: input.title ?? "New chat",
    // A title supplied at creation was chosen by the caller, so it is theirs.
    titleSource: input.title ? "user" : "auto",
    modelId: input.modelId,
    providerId: input.providerId,
    archived: false,
    pinned: false,
    messageCount: 0,
    ...(expiresAt ? { expiresAt } : {}),
    ...(customGptId ? { customGptId } : {}),
  });
  return toPublicConversation(created);
}

export async function getConversation(userId: string, conversationId: string) {
  const doc = await findOwnedConversation(userId, conversationId);
  return toPublicConversation(doc);
}

export async function updateConversation(
  userId: string,
  conversationId: string,
  input: PatchConversationInput,
) {
  const doc = await findOwnedConversation(userId, conversationId);
  if (input.title) {
    doc.title = input.title;
    // A hand-typed name outranks the model's; this stops the naming pass from
    // overwriting a rename the user made during the first exchange.
    doc.titleSource = "user";
  }
  if (input.archived !== undefined) doc.archived = input.archived;
  if (input.pinned !== undefined) {
    doc.pinned = input.pinned;
    doc.set("expiresAt", conversationExpiry(input.pinned) ?? null);
  }
  if (input.modelId) doc.modelId = input.modelId;
  if (input.providerId) doc.providerId = input.providerId;
  if (input.modelId || input.providerId) {
    await modelRegistry.assertModelAvailable(doc.providerId, doc.modelId, userId);
  }
  await doc.save();
  return toPublicConversation(doc);
}

export async function deleteConversation(userId: string, conversationId: string): Promise<void> {
  const doc = await findOwnedConversation(userId, conversationId);
  await Message.deleteMany({ conversationId: doc._id, userId });
  await doc.deleteOne();
}

export async function listMessages(
  userId: string,
  conversationId: string,
  options: { limit?: number; before?: string; includeSuperseded?: boolean } = {},
) {
  const conversation = await findOwnedConversation(userId, conversationId);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const filter: Record<string, unknown> = { conversationId: conversation._id, userId };
  if (!options.includeSuperseded) {
    filter["metadata.superseded"] = { $ne: true };
  }
  if (options.before && mongoose.isValidObjectId(options.before)) {
    const before = await Message.findOne({ _id: options.before, conversationId: conversation._id, userId });
    if (before) {
      filter.createdAt = { $lt: before.createdAt };
    }
  }

  const docs = await Message.find(filter).sort({ createdAt: -1 }).limit(limit);
  const chronological = docs.reverse();
  const attachmentMap = await publicAttachmentsForMessages(chronological.map((doc) => String(doc._id)));
  return chronological.map((doc) => toPublicMessage(doc, attachmentMap.get(String(doc._id))));
}

export async function setMessageFeedback(
  userId: string,
  conversationId: string,
  messageId: string,
  input: { rating: "up" | "down"; comment?: string },
) {
  const conversation = await findOwnedConversation(userId, conversationId);
  if (!mongoose.isValidObjectId(messageId)) {
    throw new AppError("Message not found", { statusCode: 404, code: "MESSAGE_NOT_FOUND" });
  }
  const message = await Message.findOne({
    _id: messageId,
    conversationId: conversation._id,
    userId,
    role: "assistant",
  });
  if (!message) {
    throw new AppError("Message not found", { statusCode: 404, code: "MESSAGE_NOT_FOUND" });
  }
  message.feedback = {
    rating: input.rating,
    ...(input.comment ? { comment: input.comment } : {}),
  };
  await message.save();
  return toPublicMessage(message);
}

export async function findOwnedConversation(userId: string, conversationId: string) {
  if (!mongoose.isValidObjectId(conversationId)) {
    throw new AppError("Conversation not found", { statusCode: 404, code: "CONVERSATION_NOT_FOUND" });
  }
  const doc = await Conversation.findOne({ _id: conversationId, userId });
  if (!doc) {
    throw new AppError("Conversation not found", { statusCode: 404, code: "CONVERSATION_NOT_FOUND" });
  }
  return doc;
}

export { titleFromContent } from "./chatTitle.js";
