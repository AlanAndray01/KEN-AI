import mongoose from "mongoose";
import type { PublicAttachment, PublicConversation, PublicMessage } from "@Ken/shared";
import { generationRegistry } from "./generationRegistry.js";
import type { PreparedTurn } from "./prepareTurn.js";
import type { PreparedGeneration } from "./generationTypes.js";
import { attachFilesToMessage } from "../storage/fileService.js";

export function applyThreadSelection(
  conversation: { providerId: string; modelId: string },
  turn: PreparedTurn,
): void {
  conversation.providerId = turn.threadProviderId;
  conversation.modelId = turn.threadModelId;
}

export function streamingAssistantFields(input: {
  _id?: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  userId: string;
  parentMessageId: mongoose.Types.ObjectId;
  generationId: string;
  turn: PreparedTurn;
  expiresAt?: Date | null | undefined;
}): Record<string, unknown> {
  return {
    ...(input._id ? { _id: input._id } : {}),
    conversationId: input.conversationId,
    userId: input.userId,
    role: "assistant" as const,
    content: "",
    model: input.turn.modelId,
    provider: input.turn.providerId,
    status: "streaming" as const,
    generationId: input.generationId,
    parentMessageId: input.parentMessageId,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
}

export function persistGeneratedFiles(
  userId: string,
  conversationId: string,
  doc: { _id: { toString(): string }; attachments?: unknown; save: () => Promise<unknown> },
  turn: PreparedTurn,
) {
  return persistFilesOnMessage({
    userId,
    conversationId,
    messageId: String(doc._id),
    files: turn.generatedFiles,
    doc,
  });
}

export function finishPreparedGeneration(input: {
  turn: PreparedTurn;
  userId: string;
  conversationId: string;
  generationId: string;
  userMessage: PublicMessage;
  assistantMessage: PublicMessage;
  conversation: PublicConversation;
  customGptId?: string;
}): PreparedGeneration {
  const { signal } = generationRegistry.start(input.userId, input.conversationId, input.generationId);
  const { turn } = input;
  return {
    userId: input.userId,
    conversationId: input.conversationId,
    generationId: input.generationId,
    providerId: turn.providerId,
    modelId: turn.modelId,
    modelName: turn.modelName,
    userMessage: input.userMessage,
    assistantMessage: input.assistantMessage,
    conversation: input.conversation,
    abortSignal: signal,
    ...(turn.contextWindow ? { contextWindow: turn.contextWindow } : {}),
    ...(turn.toolSystemMessages ? { toolSystemMessages: turn.toolSystemMessages } : {}),
    ...(turn.imageGenerated ? { imageGenerated: true, generatedFileIds: turn.generatedFileIds } : {}),
    ...(turn.imageOnly ? { imageOnly: true } : {}),
    ...(input.customGptId ? { customGptId: input.customGptId } : {}),
    ...(turn.routedFrom ? { routedFrom: turn.routedFrom } : {}),
    ...(turn.routeReason ? { routeReason: turn.routeReason } : {}),
    ...(turn.autoTask ? { autoTask: turn.autoTask } : {}),
    neuronTier: turn.neuronTier,
  };
}

export async function persistFilesOnMessage(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  files: Array<{
    _id: { toString(): string };
    originalName: string;
    mimeType: string;
    size: number;
    kind?: PublicAttachment["kind"] | null;
  }>;
  doc: { attachments?: unknown; save: () => Promise<unknown> };
}): Promise<PublicAttachment[]> {
  if (input.files.length === 0) return [];
  const attachments = await attachFilesToMessage({
    userId: input.userId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    files: input.files,
  });
  if (attachments.length > 0) {
    input.doc.attachments = attachments.map((item) => new mongoose.Types.ObjectId(item.id));
    await input.doc.save();
  }
  return attachments;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}
