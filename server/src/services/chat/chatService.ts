import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { ChatToolId, PublicConversation, PublicMessage } from "@aether/shared";
import { AppError } from "../../utils/AppError.js";
import { isAbortError } from "../../utils/abort.js";
import type { ChatMessage, StreamEvent } from "../ai/AIProvider.js";
import { aiProviderManager } from "../ai/AIProviderManager.js";
import { modelRegistry } from "../ai/ModelRegistry.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { contextManager } from "./ContextManager.js";
import { findOwnedConversation, titleFromContent } from "./conversationService.js";
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

  const providerId = input.providerId ?? conversation?.providerId;
  const modelId = input.modelId ?? conversation?.modelId;
  if (!providerId || !modelId) {
    throw new AppError("A model is required", { statusCode: 400, code: "VALIDATION_ERROR" });
  }

  const customGptId = input.customGptId ?? (conversation?.customGptId ? String(conversation.customGptId) : undefined);
  if (customGptId) {
    await getAccessibleGpt(input.userId, customGptId);
  }

  const model = await modelRegistry.assertModelAvailable(providerId, modelId, input.userId);
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
  const owned =
    conversation ??
    (await Conversation.create({
      userId: input.userId,
      title: titleFromContent(titleSource),
      modelId,
      providerId,
      archived: false,
      pinned: false,
      messageCount: 0,
      ...(customGptId ? { customGptId } : {}),
    }));

  if (conversation && (input.providerId || input.modelId)) {
    owned.providerId = providerId;
    owned.modelId = modelId;
  }
  if (customGptId) {
    owned.customGptId = new mongoose.Types.ObjectId(customGptId);
  }

  const generationId = randomUUID();
  const userDoc = await Message.create({
    conversationId: owned._id,
    userId: input.userId,
    role: "user",
    content: input.content,
    status: "complete",
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
  });

  owned.messageCount = (owned.messageCount ?? 0) + 2;
  owned.lastMessageAt = new Date();
  owned.lastMessagePreview = (input.content || files[0]?.originalName || "Attachment").slice(0, 280);
  if (owned.title === "New chat") {
    owned.title = titleFromContent(titleSource);
  }
  await owned.save();

  const controller = generationRegistry.start(input.userId, String(owned._id), generationId);
  return {
    userId: input.userId,
    conversationId: String(owned._id),
    generationId,
    providerId,
    modelId,
    userMessage: toPublicMessage(userDoc, publicAttachments),
    assistantMessage: toPublicMessage(assistantDoc),
    conversation: toPublicConversation(owned),
    abortSignal: controller.signal,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(toolOutcome.systemMessages.length > 0 ? { toolSystemMessages: toolOutcome.systemMessages } : {}),
    ...(customGptId ? { customGptId } : {}),
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

  const generationId = randomUUID();
  const assistantDoc = await Message.create({
    conversationId: conversation._id,
    userId: input.userId,
    role: "assistant",
    content: "",
    model: conversation.modelId,
    provider: conversation.providerId,
    status: "streaming",
    generationId,
    parentMessageId: userMessage._id,
  });
  conversation.messageCount = (conversation.messageCount ?? 0) + 1;
  await conversation.save();

  const model = await modelRegistry.assertModelAvailable(
    conversation.providerId,
    conversation.modelId,
    input.userId,
  );
  const controller = generationRegistry.start(input.userId, String(conversation._id), generationId);
  return {
    userId: input.userId,
    conversationId: String(conversation._id),
    generationId,
    providerId: conversation.providerId,
    modelId: conversation.modelId,
    userMessage: toPublicMessage(userMessage),
    assistantMessage: toPublicMessage(assistantDoc),
    conversation: toPublicConversation(conversation),
    abortSignal: controller.signal,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(conversation.customGptId ? { customGptId: String(conversation.customGptId) } : {}),
  };
}

export async function runGeneration(
  prepared: PreparedGeneration,
  emit: (event: ChatStreamEvent) => void,
  route: string,
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

  try {
    const history = await loadHistory(prepared.userId, prepared.conversationId);
    const persona = await buildPersonaMessages(prepared.userId, prepared.customGptId);
    const messages = contextManager.build({
      messages: [...persona, ...(prepared.toolSystemMessages ?? []), ...history],
      modelId: prepared.modelId,
      providerId: prepared.providerId,
      ...(prepared.contextWindow ? { contextWindow: prepared.contextWindow } : {}),
    });

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
        await Message.updateOne({ _id: prepared.assistantMessage.id }, { $set: { content: partial } });
      }
      if (event.type === "complete") {
        partial = event.response.content || partial;
        inputTokens = event.response.usage?.inputTokens;
        outputTokens = event.response.usage?.outputTokens;
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
      finishStatus = "aborted";
    }
  } catch (error) {
    if (isAbortError(error) || prepared.abortSignal.aborted) {
      finishStatus = "aborted";
    } else {
      finishStatus = "error";
      errorCode = error instanceof AppError ? error.code : "PROVIDER_ERROR";
      errorMessage = error instanceof AppError ? error.message : "Provider request failed";
    }
  }

  const assistant = await Message.findById(prepared.assistantMessage.id);
  if (assistant) {
    assistant.content = partial;
    assistant.status = finishStatus;
    assistant.set("model", prepared.modelId);
    assistant.set("provider", prepared.providerId);
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

  generationRegistry.finish(prepared.generationId, prepared.userId, prepared.conversationId);

  await recordUsage({
    userId: prepared.userId,
    providerId: prepared.providerId,
    modelId: prepared.modelId,
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
  emit({ type: "complete", assistantMessage: publicAssistant });
}

export function abortGeneration(userId: string, conversationId: string, generationId?: string): boolean {
  if (generationId) {
    return generationRegistry.abort(generationId);
  }
  return generationRegistry.abortConversation(userId, conversationId);
}

async function loadHistory(userId: string, conversationId: string): Promise<ChatMessage[]> {
  const docs = await Message.find({
    conversationId,
    userId,
    role: { $in: ["user", "assistant", "system"] },
    "metadata.superseded": { $ne: true },
    status: { $in: ["complete", "aborted", "streaming"] },
  }).sort({ createdAt: 1 });

  const attachmentMap = await publicAttachmentsForMessages(docs.map((doc) => String(doc._id)));
  const fileIds = [...attachmentMap.values()].flat().map((item) => item.fileId);
  const files = fileIds.length > 0 ? await loadOwnedFiles(userId, fileIds) : [];
  const fileMap = new Map(files.map((file) => [String(file._id), file]));

  const result: ChatMessage[] = [];
  for (const doc of docs) {
    if (!doc.content && doc.role !== "user") continue;
    const attachments = attachmentMap.get(String(doc._id)) ?? [];
    const messageFiles = attachments
      .map((item) => fileMap.get(item.fileId))
      .filter((file): file is (typeof files)[number] => Boolean(file));
    let content = doc.content ?? "";
    let parts: ChatMessage["parts"];
    if (messageFiles.length > 0) {
      const materialized = await materializeFilesForModel(messageFiles);
      content = [content, materialized.contentSuffix].filter(Boolean).join("\n\n");
      if (materialized.parts.length > 0) {
        parts = materialized.parts;
      }
    }
    result.push({
      role: doc.role as ChatMessage["role"],
      content,
      ...(parts ? { parts } : {}),
    });
  }
  return result;
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
