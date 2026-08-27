import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { ChatToolId, PublicConversation, PublicMessage } from "@Ken/shared";
import { DEFAULT_GROQ_MODEL_ID, resolveDeepSeekModelId, resolveGroqModelId } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { isAbortError, isTimeoutAbort } from "../../utils/abort.js";
import { toSafeError } from "../../utils/redact.js";
import type { ChatMessage, StreamEvent } from "../ai/AIProvider.js";
import { aiProviderManager } from "../ai/AIProviderManager.js";
import { modelRegistry } from "../ai/ModelRegistry.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { contextManager, estimateContextTokens, MAX_HISTORY_MESSAGES } from "./ContextManager.js";
import { findOwnedConversation, titleFromContent, capStoredTurns, conversationExpiry } from "./conversationService.js";
import { generateChatTitle } from "./chatTitle.js";
import { buildResponsePolicyMessage } from "./responsePolicy.js";
import { generationRegistry } from "./generationRegistry.js";
import { toPublicConversation, toPublicMessage } from "./toPublic.js";
import { recordUsage } from "./usageService.js";
import { getAccessibleGpt } from "../gpts/gptService.js";
import { buildPersonaMessages } from "../memory/persona.js";
import {
  assertAttachmentsAllowed,
  attachFilesToMessage,
  loadOwnedFiles,
  materializeFilesForModel,
  publicAttachmentsForMessages,
} from "../storage/fileService.js";

export interface PreparedGeneration {
  userId: string;
  conversationId: string;
  generationId: string;
  providerId: string;
  modelId: string;
  userMessage: PublicMessage;
  assistantMessage: PublicMessage;
  conversation: PublicConversation;
  abortSignal: AbortSignal;
  contextWindow?: number;
  toolSystemMessages?: ChatMessage[];
  customGptId?: string;
}

export interface ChatStreamEvent {
  type: "start" | "chunk" | "complete" | "aborted" | "error";
  conversation?: PublicConversation;
  userMessage?: PublicMessage;
  assistantMessage?: PublicMessage;
  generationId?: string;
  text?: string;
  message?: string;
  code?: string;
}

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

  const { providerId, modelId, model } = await resolveExecutionModel(
    input.userId,
    requestedProviderId,
    requestedModelId,
  );
  const toolOutcome = await aiProviderManager.applyEnabledTools({
    content: input.content,
    userId: input.userId,
    capabilities: model.capabilities,
    ...(input.enabledTools ? { enabledTools: input.enabledTools } : {}),
  });
  const fileIds = [...(input.attachmentIds ?? []), ...toolOutcome.files.map((file) => file.id)];
  const files = fileIds.length > 0 ? await loadOwnedFiles(input.userId, fileIds) : [];
  if (files.length > 0) {
    assertAttachmentsAllowed(model.capabilities, files);
  }

  const titleSource = input.content.trim() || files[0]?.originalName || "New chat";
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
      modelId,
      providerId,
      archived: false,
      pinned: false,
      messageCount: 0,
      ...(expiresAt ? { expiresAt } : {}),
      ...(customGptId ? { customGptId } : {}),
    }));

  if (conversation && (input.providerId || input.modelId)) {
    owned.providerId = providerId;
    owned.modelId = modelId;
  }
  if (customGptId) {
    owned.customGptId = new mongoose.Types.ObjectId(customGptId);
  }
  if (!owned.pinned) {
    owned.set("expiresAt", conversationExpiry(false));
  }

  const generationId = randomUUID();
  const userDoc = await Message.create({
    conversationId: owned._id,
    userId: input.userId,
    role: "user",
    content: input.content,
    status: "complete",
    ...(owned.expiresAt ? { expiresAt: owned.expiresAt } : {}),
  });
  const publicAttachments =
    files.length > 0
      ? await attachFilesToMessage({
          userId: input.userId,
          conversationId: String(owned._id),
          messageId: String(userDoc._id),
          files,
        })
      : [];
  if (publicAttachments.length > 0) {
    userDoc.attachments = publicAttachments.map((item) => new mongoose.Types.ObjectId(item.id));
    await userDoc.save();
  }

  const assistantDoc = await Message.create({
    conversationId: owned._id,
    userId: input.userId,
    role: "assistant",
    content: "",
    model: modelId,
    provider: providerId,
    status: "streaming",
    generationId,
    parentMessageId: userDoc._id,
    ...(owned.expiresAt ? { expiresAt: owned.expiresAt } : {}),
  });

  owned.messageCount = (owned.messageCount ?? 0) + 2;
  owned.lastMessageAt = new Date();
  owned.lastMessagePreview = (input.content || files[0]?.originalName || "Attachment").slice(0, 280);
  if (owned.title === "New chat") {
    owned.title = titleFromContent(titleSource);
  }
  await owned.save();
  await capStoredTurns(String(owned._id), input.userId);

  const { signal } = generationRegistry.start(input.userId, String(owned._id), generationId);
  return {
    userId: input.userId,
    conversationId: String(owned._id),
    generationId,
    providerId,
    modelId,
    userMessage: toPublicMessage(userDoc, publicAttachments),
    assistantMessage: toPublicMessage(assistantDoc),
    conversation: toPublicConversation(owned),
    abortSignal: signal,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(toolOutcome.systemMessages.length > 0 ? { toolSystemMessages: toolOutcome.systemMessages } : {}),
    ...(customGptId ? { customGptId } : {}),
  };
}

/**
 * Rewrites one of the user's own turns and answers the new question.
 *
 * Editing branches the thread: every message after the edited turn was a reply
 * to the old wording, so keeping them would feed the model a history that
 * contradicts the question it is being asked. They are marked superseded rather
 * than deleted — the same flag regenerate already uses — so history building,
 * the message list, exports, and share links all skip them while the original
 * exchange stays recoverable in the database.
 */
export async function prepareEdit(input: {
  userId: string;
  conversationId: string;
  messageId: string;
  content: string;
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

  target.content = input.content;
  target.set("metadata", {
    ...(asRecord(target.metadata) ?? {}),
    edited: true,
    editedAt: new Date().toISOString(),
  });
  await target.save();

  // Compares on createdAt, falling back to _id when two documents share a
  // millisecond — a user turn and its assistant reply are often created in the
  // same tick, and a plain `$gt: createdAt` would leave that reply behind.
  await Message.updateMany(
    {
      conversationId: conversation._id,
      userId: input.userId,
      "metadata.superseded": { $ne: true },
      $or: [
        { createdAt: { $gt: target.createdAt } },
        { createdAt: target.createdAt, _id: { $gt: target._id } },
      ],
    },
    { $set: { "metadata.superseded": true } },
  );

  const { providerId, modelId, model } = await resolveExecutionModel(
    input.userId,
    conversation.providerId,
    conversation.modelId,
  );
  if (providerId !== conversation.providerId || modelId !== conversation.modelId) {
    conversation.providerId = providerId;
    conversation.modelId = modelId;
  }

  const generationId = randomUUID();
  const assistantDoc = await Message.create({
    conversationId: conversation._id,
    userId: input.userId,
    role: "assistant",
    content: "",
    model: modelId,
    provider: providerId,
    status: "streaming",
    generationId,
    parentMessageId: target._id,
  });
  conversation.messageCount = (conversation.messageCount ?? 0) + 1;
  await conversation.save();

  const { signal } = generationRegistry.start(input.userId, String(conversation._id), generationId);
  return {
    userId: input.userId,
    conversationId: String(conversation._id),
    generationId,
    providerId,
    modelId,
    userMessage: toPublicMessage(target),
    assistantMessage: toPublicMessage(assistantDoc),
    conversation: toPublicConversation(conversation),
    abortSignal: signal,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(conversation.customGptId ? { customGptId: String(conversation.customGptId) } : {}),
  };
}

export async function prepareRegenerate(input: {
  userId: string;
  conversationId: string;
  messageId: string;
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
          }).sort({ createdAt: -1 });

  if (!userMessage || userMessage.role !== "user") {
    throw new AppError("Cannot regenerate this message", { statusCode: 400, code: "REGENERATE_UNAVAILABLE" });
  }

  if (target.role === "assistant") {
    target.set("metadata", { ...(asRecord(target.metadata) ?? {}), superseded: true });
    await target.save();
  }

  const { providerId, modelId, model } = await resolveExecutionModel(
    input.userId,
    conversation.providerId,
    conversation.modelId,
  );
  if (providerId !== conversation.providerId || modelId !== conversation.modelId) {
    conversation.providerId = providerId;
    conversation.modelId = modelId;
  }

  const generationId = randomUUID();
  const assistantDoc = await Message.create({
    conversationId: conversation._id,
    userId: input.userId,
    role: "assistant",
    content: "",
    model: modelId,
    provider: providerId,
    status: "streaming",
    generationId,
    parentMessageId: userMessage._id,
  });
  conversation.messageCount = (conversation.messageCount ?? 0) + 1;
  await conversation.save();
  const { signal } = generationRegistry.start(input.userId, String(conversation._id), generationId);
  return {
    userId: input.userId,
    conversationId: String(conversation._id),
    generationId,
    providerId,
    modelId,
    userMessage: toPublicMessage(userMessage),
    assistantMessage: toPublicMessage(assistantDoc),
    conversation: toPublicConversation(conversation),
    abortSignal: signal,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(conversation.customGptId ? { customGptId: String(conversation.customGptId) } : {}),
  };
}

export async function runGeneration(
  prepared: PreparedGeneration,
  emit: (event: ChatStreamEvent) => void,
  route: string,
  preloaded?: { history: ChatMessage[]; persona: ChatMessage[] },
): Promise<void> {
  const started = Date.now();
  emit({
    type: "start",
    conversation: prepared.conversation,
    userMessage: prepared.userMessage,
    assistantMessage: prepared.assistantMessage,
    generationId: prepared.generationId,
  });

  let partial = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let finishStatus: "complete" | "aborted" | "error" = "complete";
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let executedProviderId = prepared.providerId;
  let executedModelId = prepared.modelId;

  try {
    const [history, persona] = preloaded
      ? [preloaded.history, preloaded.persona]
      : await Promise.all([
          loadHistory(prepared.userId, prepared.conversationId),
          buildPersonaMessages(prepared.userId, prepared.customGptId),
        ]);
    const messages = contextManager.build({
      messages: [
        buildResponsePolicyMessage(prepared.userMessage.content, {
          skipProtocol: Boolean(prepared.customGptId),
        }),
        ...persona,
        ...(prepared.toolSystemMessages ?? []),
        ...withCurrentUser(history, prepared.userMessage),
      ],
      modelId: prepared.modelId,
      providerId: prepared.providerId,
      ...(prepared.contextWindow ? { contextWindow: prepared.contextWindow } : {}),
    });
    logger.info(
      {
        providerId: prepared.providerId,
        modelId: prepared.modelId,
        estimatedInputTokens: estimateContextTokens(messages),
        historyMessages: messages.filter((message) => message.role !== "system").length,
        systemMessages: messages.filter((message) => message.role === "system").length,
      },
      "chat generation context",
    );

    let chunks = 0;
    for await (const event of aiProviderManager.stream({
      providerId: prepared.providerId,
      modelId: prepared.modelId,
      messages,
      userId: prepared.userId,
      abortSignal: prepared.abortSignal,
    })) {
      if (prepared.abortSignal.aborted) {
        finishStatus = "aborted";
        break;
      }
      applyStreamEvent(event, (text) => {
        partial += text;
        emit({ type: "chunk", text });
      });
      chunks += 1;
      if (chunks % 12 === 0 && partial) {
        void Message.updateOne({ _id: prepared.assistantMessage.id }, { $set: { content: partial } });
      }
      if (event.type === "complete") {
        partial = event.response.content || partial;
        inputTokens = event.response.usage?.inputTokens;
        outputTokens = event.response.usage?.outputTokens;
        if (event.response.provider) executedProviderId = event.response.provider;
        if (event.response.model) executedModelId = event.response.model;
        if (event.response.metadata && event.response.metadata["aborted"] === true) {
          finishStatus = "aborted";
        }
      }
      if (event.type === "error") {
        finishStatus = "error";
        errorCode = event.code;
        errorMessage = event.message;
      }
    }

    if (prepared.abortSignal.aborted) {
      if (isTimeoutAbort(prepared.abortSignal)) {
        finishStatus = "error";
        errorCode = "GENERATION_TIMEOUT";
        errorMessage = "The model took too long to respond.";
      } else {
        finishStatus = "aborted";
      }
    }
  } catch (error) {
    if (isAbortError(error) || prepared.abortSignal.aborted) {
      finishStatus = "aborted";
    } else {
      finishStatus = "error";
      errorCode = error instanceof AppError ? error.code : "PROVIDER_ERROR";
      errorMessage = error instanceof AppError ? error.message : "Provider request failed";
      logger.warn(
        {
          providerId: prepared.providerId,
          modelId: prepared.modelId,
          errorCode,
          err: toSafeError(error),
        },
        "chat generation failed",
      );
    }
  }

  if (prepared.abortSignal.aborted && isTimeoutAbort(prepared.abortSignal)) {
    finishStatus = "error";
    errorCode = "GENERATION_TIMEOUT";
    errorMessage = "The model took too long to respond.";
  }

  const assistant = await Message.findById(prepared.assistantMessage.id);
  if (assistant) {
    assistant.content = partial;
    assistant.status = finishStatus;
    assistant.set("model", executedModelId);
    assistant.set("provider", executedProviderId);
    if (finishStatus === "error") {
      assistant.set("metadata", {
        ...(asRecord(assistant.metadata) ?? {}),
        errorCode,
        errorMessage,
      });
    }
    await assistant.save();
  }

  const conversation = await findOwnedConversation(prepared.userId, prepared.conversationId);
  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = (partial || prepared.userMessage.content).slice(0, 280);
  await conversation.save();

  await maybeUpgradeTitle(conversation, prepared, partial, finishStatus);

  generationRegistry.finish(prepared.generationId, prepared.userId, prepared.conversationId);

  await recordUsage({
    userId: prepared.userId,
    providerId: executedProviderId,
    modelId: executedModelId,
    conversationId: prepared.conversationId,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    durationMs: Date.now() - started,
    success: finishStatus !== "error",
    ...(errorCode ? { errorCode } : {}),
    route,
  });

  const publicAssistant = assistant ? toPublicMessage(assistant) : prepared.assistantMessage;

  if (finishStatus === "aborted") {
    emit({ type: "aborted", assistantMessage: { ...publicAssistant, content: partial, status: "aborted" } });
    return;
  }
  if (finishStatus === "error") {
    emit({
      type: "error",
      assistantMessage: publicAssistant,
      message: errorMessage ?? "Provider request failed",
      ...(errorCode ? { code: errorCode } : {}),
    });
    return;
  }
  // The conversation rides along so a title written above reaches the sidebar.
  emit({
    type: "complete",
    assistantMessage: publicAssistant,
    conversation: toPublicConversation(conversation),
  });
}

/**
 * Replaces the keyword placeholder title with a model-written one, once.
 *
 * Only the first exchange qualifies. The message count covers the opening send
 * (2) plus a regenerate or edit of that same turn (3), and stops at the second
 * user turn (4) - so an established chat is never silently renamed, including
 * the ones that predate this field and hydrate as "auto".
 */
const FIRST_EXCHANGE_MESSAGE_COUNT = 3;

async function maybeUpgradeTitle(
  conversation: Awaited<ReturnType<typeof findOwnedConversation>>,
  prepared: PreparedGeneration,
  reply: string,
  finishStatus: "complete" | "aborted" | "error",
): Promise<void> {
  if (finishStatus !== "complete" || !reply.trim()) return;
  if (conversation.titleSource !== "auto") return;
  if ((conversation.messageCount ?? 0) > FIRST_EXCHANGE_MESSAGE_COUNT) return;

  const title = await generateChatTitle({
    userId: prepared.userId,
    providerId: prepared.providerId,
    modelId: prepared.modelId,
    userMessage: prepared.userMessage.content,
    assistantReply: reply,
  });
  if (!title) return;

  conversation.title = title;
  conversation.titleSource = "model";
  await conversation.save();
}

export function abortGeneration(userId: string, conversationId: string, generationId?: string): boolean {
  if (generationId) {
    return generationRegistry.abort(generationId);
  }
  return generationRegistry.abortConversation(userId, conversationId);
}

export async function loadHistory(userId: string, conversationId: string): Promise<ChatMessage[]> {
  const newestFirst = await Message.find({
    conversationId,
    userId,
    role: { $in: ["user", "assistant", "system"] },
    "metadata.superseded": { $ne: true },
    status: { $in: ["complete", "aborted", "streaming"] },
  })
    .sort({ createdAt: -1 })
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
        const materialized = await materializeFilesForModel(messageFiles);
        content = [content, materialized.contentSuffix].filter(Boolean).join("\n\n");
        if (materialized.parts.length > 0) {
          parts = materialized.parts;
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

async function resolveExecutionModel(
  userId: string,
  providerId: string,
  modelId: string,
): Promise<{ providerId: string; modelId: string; model: Awaited<ReturnType<typeof modelRegistry.assertModelAvailable>> }> {
  const executionModelId =
    providerId === "groq"
      ? resolveGroqModelId(modelId)
      : providerId === "deepseek"
        ? resolveDeepSeekModelId(modelId)
        : modelId;
  try {
    const model = await modelRegistry.assertModelAvailable(providerId, executionModelId, userId);
    return { providerId, modelId: executionModelId, model };
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "MODEL_UNAVAILABLE") throw error;
    const models = await modelRegistry.listPublicModels(userId);
    const groq =
      models.find((model) => model.providerId === "groq" && model.id === DEFAULT_GROQ_MODEL_ID) ??
      models.find((model) => model.providerId === "groq");
    if (!groq) throw error;
    return { providerId: groq.providerId, modelId: groq.id, model: groq };
  }
}

function withCurrentUser(history: ChatMessage[], userMessage: PublicMessage): ChatMessage[] {
  const last = history.at(-1);
  if (last?.role === "user" && last.content === userMessage.content) return history;
  return [...history, { role: "user", content: userMessage.content }];
}

function applyStreamEvent(event: StreamEvent, onChunk: (text: string) => void): void {
  if (event.type === "chunk" && event.text) {
    onChunk(event.text);
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}
