import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import type { ChatToolId, PublicConversation, PublicMessage } from "@Ken/shared";
import {
  AUTO_MODEL_ID,
  AUTO_PROVIDER_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  resolveDeepSeekModelId,
  resolveGeminiModelId,
  resolveGroqModelId,
  isAutoSelection,
  type AutoTask,
} from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { isAbortError, isTimeoutAbort } from "../../utils/abort.js";
import { toSafeError } from "../../utils/redact.js";
import type { ChatMessage, StreamEvent } from "../ai/AIProvider.js";
import { aiProviderManager } from "../ai/AIProviderManager.js";
import { attachmentNeed, pickMultimodalRoute } from "../ai/attachmentRoute.js";
import { modelRegistry } from "../ai/ModelRegistry.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { contextManager, estimateContextTokens, MAX_HISTORY_MESSAGES } from "./ContextManager.js";
import { findOwnedConversation, titleFromContent, capStoredTurns, conversationExpiry } from "./conversationService.js";
import { generateChatTitle } from "./chatTitle.js";
import { describeSelectedModel } from "./identity.js";
import { nextOpenGeminiModelId, peekModelSkip } from "../ai/modelSkip.js";
import { planAutoRoute } from "./autoRoute.js";
import { buildDeepCodeMessage, detectDeepCodeRequest } from "./codeGeneration.js";
import { estimateGenerationMs } from "./generationEstimate.js";
import { buildResponsePolicyMessages, detectTaskSignals, isLowThinkingTurn, replyMaxTokens } from "./responsePolicy.js";
import { buildSseTiming, type SseTiming } from "../../utils/sse.js";
import { generationRegistry } from "./generationRegistry.js";
import { toPublicConversation, toPublicMessage } from "./toPublic.js";
import { recordUsage } from "./usageService.js";
import { getAccessibleGpt } from "../gpts/gptService.js";
import { buildPersonaMessages } from "../memory/persona.js";
import {
  assertAttachmentsAllowed,
  attachFilesToMessage,
  copyMessageAttachments,
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
  modelName: string;
  userMessage: PublicMessage;
  assistantMessage: PublicMessage;
  conversation: PublicConversation;
  abortSignal: AbortSignal;
  contextWindow?: number;
  toolSystemMessages?: ChatMessage[];
  customGptId?: string;
  routedFrom?: string;
  routeReason?: string;
  /** Set when Auto picked the model for this turn. */
  autoTask?: AutoTask;
}

export interface ChatStreamEvent {
  type: "start" | "chunk" | "complete" | "aborted" | "error" | "timing" | "model" | "estimate";
  conversation?: PublicConversation;
  userMessage?: PublicMessage;
  assistantMessage?: PublicMessage;
  generationId?: string;
  text?: string;
  message?: string;
  code?: string;
  requestId?: string;
  requestedModel?: string;
  activeModel?: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  ttfbMs?: number;
  googleConnectMs?: number;
  firstVisibleChunkMs?: number;
  completeMs?: number;
  /** Median duration of comparable past runs on this model. Absent until enough history exists. */
  estimatedMs?: number;
  /** Sample count behind `estimatedMs`, so the UI can hedge a thin estimate. */
  estimateSamples?: number;
  /** False when a deep-code turn had to borrow general-mode samples. */
  estimateMatchedMode?: boolean;
  /** This turn asked for a substantial code artifact. */
  deepCode?: boolean;
  /** Set when Auto picked the model, naming what it routed for. */
  autoTask?: AutoTask;
  model?: string;
  modelName?: string;
  provider?: string;
}

export interface GenerationRuntime {
  requestId?: string;
  startedAt?: number;
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

  const earlyIds = input.attachmentIds ?? [];
  const earlyFiles = earlyIds.length > 0 ? await loadOwnedFiles(input.userId, earlyIds) : [];
  const autoPlan = isAutoSelection(requestedProviderId, requestedModelId)
    ? await routeAuto(input.userId, {
        content: input.content,
        files: earlyFiles,
        ...(input.enabledTools ? { enabledTools: input.enabledTools } : {}),
      })
    : undefined;
  const requested =
    autoPlan ??
    (await resolveExecutionModel(
      input.userId,
      requestedProviderId,
      requestedModelId,
      input.modelId !== undefined,
    ));
  const routed = await routeForAttachments(input.userId, requested, earlyFiles);
  const { providerId, modelId, model } = routed;
  const toolOutcome =
    input.enabledTools && input.enabledTools.length > 0
      ? await aiProviderManager.applyEnabledTools({
          content: input.content,
          userId: input.userId,
          capabilities: model.capabilities,
          enabledTools: input.enabledTools,
        })
      : { systemMessages: [], files: [] };
  const fileIds = [...earlyIds, ...toolOutcome.files.map((file) => file.id)];
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
      // The thread stores the sentinel, so its next turn stays on Auto.
      modelId: autoPlan ? AUTO_MODEL_ID : modelId,
      providerId: autoPlan ? AUTO_PROVIDER_ID : providerId,
      archived: false,
      pinned: false,
      messageCount: 0,
      ...(expiresAt ? { expiresAt } : {}),
      ...(customGptId ? { customGptId } : {}),
    }));

  owned.providerId = autoPlan ? AUTO_PROVIDER_ID : providerId;
  owned.modelId = autoPlan ? AUTO_MODEL_ID : modelId;
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
  owned.lastMessagePreview = (input.content || files[0]?.originalName || "Attachment").slice(0, 280);
  if (owned.title === "New chat") {
    owned.title = titleFromContent(titleSource);
  }

  const userFields = {
    _id: userOid,
    conversationId: owned._id,
    userId: input.userId,
    role: "user" as const,
    content: input.content,
    status: "complete" as const,
    ...(owned.expiresAt ? { expiresAt: owned.expiresAt } : {}),
  };
  const assistantFields = {
    _id: assistantOid,
    conversationId: owned._id,
    userId: input.userId,
    role: "assistant" as const,
    content: "",
    model: modelId,
    provider: providerId,
    status: "streaming" as const,
    generationId,
    parentMessageId: userOid,
    ...(owned.expiresAt ? { expiresAt: owned.expiresAt } : {}),
  };

  let userDoc;
  let assistantDoc;
  let publicAttachments: Awaited<ReturnType<typeof attachFilesToMessage>> = [];

  if (files.length > 0) {
    userDoc = await Message.create(userFields);
    publicAttachments = await attachFilesToMessage({
      userId: input.userId,
      conversationId: String(owned._id),
      messageId: String(userDoc._id),
      files,
    });
    if (publicAttachments.length > 0) {
      userDoc.attachments = publicAttachments.map((item) => new mongoose.Types.ObjectId(item.id));
      await userDoc.save();
    }
    [assistantDoc] = await Promise.all([Message.create(assistantFields), owned.save()]);
  } else {
    [userDoc, assistantDoc] = await Promise.all([
      Message.create(userFields),
      Message.create(assistantFields),
      owned.save(),
    ]);
  }
  void capStoredTurns(String(owned._id), input.userId);

  const { signal } = generationRegistry.start(input.userId, String(owned._id), generationId);
  return {
    userId: input.userId,
    conversationId: String(owned._id),
    generationId,
    providerId,
    modelId,
    modelName: describeSelectedModel(modelId, model.name),
    userMessage: toPublicMessage(userDoc, publicAttachments),
    assistantMessage: toPublicMessage(assistantDoc),
    conversation: toPublicConversation(owned),
    abortSignal: signal,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(toolOutcome.systemMessages.length > 0 ? { toolSystemMessages: toolOutcome.systemMessages } : {}),
    ...(customGptId ? { customGptId } : {}),
    ...routeTrail(routed, autoPlan),
  };
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
  const autoPlan = isAutoSelection(selectedProviderId, selectedModelId)
    ? await routeAuto(input.userId, { content: input.content, files: attachments })
    : undefined;
  const requested =
    autoPlan ??
    (await resolveExecutionModel(input.userId, selectedProviderId, selectedModelId, input.modelId !== undefined));
  const routed = await routeForAttachments(input.userId, requested, attachments);
  const { providerId, modelId, model } = routed;
  conversation.providerId = autoPlan ? AUTO_PROVIDER_ID : providerId;
  conversation.modelId = autoPlan ? AUTO_MODEL_ID : modelId;

  const assistantDoc = await Message.create({
    conversationId: conversation._id,
    userId: input.userId,
    role: "assistant",
    content: "",
    model: modelId,
    provider: providerId,
    status: "streaming",
    generationId,
    parentMessageId: userDoc._id,
    ...(conversation.expiresAt ? { expiresAt: conversation.expiresAt } : {}),
  });
  conversation.messageCount = (conversation.messageCount ?? 0) + 2;
  conversation.lastMessageAt = new Date();
  conversation.lastMessagePreview = input.content.slice(0, 280);
  await conversation.save();

  const { signal } = generationRegistry.start(input.userId, String(conversation._id), generationId);
  return {
    userId: input.userId,
    conversationId: String(conversation._id),
    generationId,
    providerId,
    modelId,
    modelName: describeSelectedModel(modelId, model.name),
    userMessage: toPublicMessage(userDoc, attachments),
    assistantMessage: toPublicMessage(assistantDoc),
    conversation: toPublicConversation(conversation),
    abortSignal: signal,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(conversation.customGptId ? { customGptId: String(conversation.customGptId) } : {}),
    ...routeTrail(routed, autoPlan),
  };
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
          }).sort({ createdAt: -1 });

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
  const autoPlan = isAutoSelection(selectedProviderId, selectedModelId)
    ? await routeAuto(input.userId, { content: userMessage.content ?? "", files: existingAttachments })
    : undefined;
  const requested =
    autoPlan ??
    (await resolveExecutionModel(input.userId, selectedProviderId, selectedModelId, input.modelId !== undefined));
  const routed = await routeForAttachments(input.userId, requested, existingAttachments);
  const { providerId, modelId, model } = routed;
  conversation.providerId = autoPlan ? AUTO_PROVIDER_ID : providerId;
  conversation.modelId = autoPlan ? AUTO_MODEL_ID : modelId;

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
    modelName: describeSelectedModel(modelId, model.name),
    userMessage: toPublicMessage(userMessage),
    assistantMessage: toPublicMessage(assistantDoc),
    conversation: toPublicConversation(conversation),
    abortSignal: signal,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    ...(conversation.customGptId ? { customGptId: String(conversation.customGptId) } : {}),
    ...routeTrail(routed, autoPlan),
  };
}

export async function runGeneration(
  prepared: PreparedGeneration,
  emit: (event: ChatStreamEvent) => void,
  route: string,
  preloaded?: { history: ChatMessage[]; persona: ChatMessage[] },
  runtime?: GenerationRuntime,
): Promise<void> {
  const started = Date.now();
  const clock = runtime?.startedAt ?? started;
  const requestId = runtime?.requestId;
  const ttfbMs = Date.now() - clock;

  let partial = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let finishStatus: "complete" | "aborted" | "error" = "complete";
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let executedProviderId = prepared.providerId;
  let executedModelId = prepared.modelId;
  let fallbackFrom: string | undefined;
  let fallbackReason: string | undefined;
  const streamProviderId = prepared.providerId;
  let streamModelId = prepared.modelId;

  if (prepared.routedFrom) {
    fallbackFrom = prepared.routedFrom;
    fallbackReason = prepared.routeReason;
  }

  const skip = peekModelSkip(prepared.providerId, prepared.modelId);
  // Only a remembered quota error may start the turn on another model. A cached
  // 503 or timeout is transient, so the model the user picked is tried again.
  if (skip && skip.code === "PROVIDER_RATE_LIMITED" && prepared.providerId === "gemini") {
    const next = nextOpenGeminiModelId(prepared.modelId);
    if (next) {
      streamModelId = next;
      executedModelId = next;
      fallbackFrom = prepared.modelId;
      fallbackReason = skip.reason;
    }
  }

  const startAssistant =
    executedModelId !== prepared.modelId
      ? { ...prepared.assistantMessage, model: executedModelId, provider: executedProviderId }
      : prepared.assistantMessage;

  const deepCode = detectDeepCodeRequest(prepared.userMessage.content);

  emit({
    type: "start",
    conversation: prepared.conversation,
    userMessage: prepared.userMessage,
    assistantMessage: startAssistant,
    generationId: prepared.generationId,
    deepCode,
    ...(prepared.autoTask ? { autoTask: prepared.autoTask } : {}),
  });

  // Priced off UsageRecord history, which costs a Mongo round-trip. Emitted as
  // its own event so `start` — and therefore the first paint — is never held up
  // waiting for a figure the UI can fill in a moment later.
  void estimateGenerationMs({
    providerId: executedProviderId,
    modelId: executedModelId,
    deepCode,
  }).then((estimate) => {
    if (!estimate) return;
    emit({
      type: "estimate",
      generationId: prepared.generationId,
      estimatedMs: estimate.estimatedMs,
      estimateSamples: estimate.sampleSize,
      estimateMatchedMode: estimate.matchedMode,
      deepCode,
    });
  });
  if (fallbackFrom) {
    emit({
      type: "model",
      model: executedModelId,
      provider: executedProviderId,
      activeModel: executedModelId,
      fallbackFrom,
      assistantMessage: startAssistant,
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(prepared.modelName ? { modelName: prepared.modelName } : {}),
      ...(prepared.autoTask ? { autoTask: prepared.autoTask } : {}),
    });
  }
  let googleConnectMs: number | undefined;
  let firstVisibleChunkMs: number | undefined;

  const emitTiming = (extra: Partial<SseTiming> = {}): void => {
    const payload = buildSseTiming({
      requestedModel: prepared.modelId,
      activeModel: executedModelId,
      ttfbMs,
      ...(requestId ? { requestId } : {}),
      ...(fallbackFrom ? { fallbackFrom } : {}),
      ...(fallbackReason ? { fallbackReason } : {}),
      ...(googleConnectMs !== undefined ? { googleConnectMs } : {}),
      ...(firstVisibleChunkMs !== undefined ? { firstVisibleChunkMs } : {}),
      ...extra,
    });
    logger.info({ ...payload, requestId }, "chat stream timing");
    emit(payload);
  };
  if (fallbackFrom) emitTiming();

  try {
    const signals = detectTaskSignals(prepared.userMessage.content);
    const hasAttachments = (prepared.userMessage.attachments?.length ?? 0) > 0;
    const currentUser = await currentUserTurn(prepared.userId, prepared.userMessage);
    // Preload races persist, so the new turn (and its files) is often missing
    // from history. Never drop attachments just because the text is small talk.
    const casual = signals.budget === "minimal" && !hasAttachments;
    const lowThinking = isLowThinkingTurn(signals);
    const [history, persona] = casual
      ? [[], []]
      : preloaded
        ? [preloaded.history, preloaded.persona]
        : await Promise.all([
            loadHistory(prepared.userId, prepared.conversationId),
            buildPersonaMessages(prepared.userId, prepared.customGptId),
          ]);
    const messages = contextManager.build({
      messages: casual
        ? [
            ...buildResponsePolicyMessages(prepared.userMessage.content, {
              modelName: prepared.modelName,
            }),
            currentUser,
          ]
        : [
            ...buildResponsePolicyMessages(prepared.userMessage.content, {
              skipProtocol: Boolean(prepared.customGptId),
              modelName: prepared.modelName,
            }),
            // Appended after the cacheable prefix so a code turn does not
            // invalidate the shared identity/protocol prefix for other turns.
            ...(deepCode ? [buildDeepCodeMessage()] : []),
            ...persona,
            ...(prepared.toolSystemMessages ?? []),
            ...withCurrentUser(history, currentUser),
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
    // A deep code turn is truncated by the medium budget: the reply gets cut
    // mid-function, which is worse than no answer. Floor it at the long budget.
    const maxTokens = deepCode
      ? Math.max(replyMaxTokens(signals.budget), replyMaxTokens("long"))
      : replyMaxTokens(signals.budget);
    for await (const event of aiProviderManager.stream({
      providerId: streamProviderId,
      modelId: streamModelId,
      messages,
      userId: prepared.userId,
      abortSignal: prepared.abortSignal,
      maxTokens,
      skipAvailabilityCheck: true,
      // A model the user picked moves only for a provider quota error, and the
      // stream surfaces that hop rather than hiding it. An Auto turn has no
      // user-chosen model to protect, so it keeps the normal retryable failover.
      ...(prepared.autoTask ? {} : { fallbackPolicy: "quota-only" as const }),
      ...(requestId ? { requestId } : {}),
      ...(lowThinking ? { reasoningEffort: "none" as const } : {}),
    })) {
      if (prepared.abortSignal.aborted) {
        finishStatus = "aborted";
        break;
      }
      if (event.type === "fallback") {
        executedModelId = event.model;
        executedProviderId = event.provider;
        fallbackFrom = event.fallbackFrom;
        fallbackReason = event.fallbackReason;
        emit({
          type: "model",
          model: event.model,
          provider: event.provider,
          activeModel: event.model,
          fallbackFrom: event.fallbackFrom,
          fallbackReason: event.fallbackReason,
          modelName: describeSelectedModel(event.model),
          assistantMessage: {
            ...prepared.assistantMessage,
            model: event.model,
            provider: event.provider,
          },
        });
        emitTiming();
        void Message.updateOne(
          { _id: prepared.assistantMessage.id },
          { $set: { model: event.model, provider: event.provider } },
        );
      }
      if (event.type === "connected") {
        googleConnectMs = event.connectMs;
      }
      applyStreamEvent(event, (text) => {
        if (firstVisibleChunkMs === undefined) {
          firstVisibleChunkMs = Date.now() - clock;
          emitTiming({ firstVisibleChunkMs });
        }
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
          requestId,
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
    if (prepared.autoTask) {
      // Kept on the reply so a reloaded thread still shows that Auto chose it.
      assistant.set("metadata", { ...(asRecord(assistant.metadata) ?? {}), autoTask: prepared.autoTask });
    }
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
    providerId: executedProviderId,
    modelId: executedModelId,
    conversationId: prepared.conversationId,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    durationMs: Date.now() - started,
    // Feeds the next turn's estimate: deep-code durations are pooled separately
    // from ordinary replies so neither skews the other's median.
    deepCode,
    success: finishStatus !== "error",
    ...(errorCode ? { errorCode } : {}),
    route,
  });

  const publicAssistant = assistant ? toPublicMessage(assistant) : prepared.assistantMessage;
  emitTiming({ completeMs: Date.now() - clock });

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
  emit({
    type: "complete",
    assistantMessage: publicAssistant,
    conversation: toPublicConversation(conversation),
  });

  // Naming is a second Groq round-trip. Waiting for it kept the SSE open
  // (and the stop button up) after the user already had the full reply.
  void maybeUpgradeTitle(
    conversation,
    { ...prepared, providerId: executedProviderId, modelId: executedModelId },
    partial,
    finishStatus,
  );
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

interface AutoResolution {
  providerId: string;
  modelId: string;
  model: Awaited<ReturnType<typeof modelRegistry.assertModelAvailable>>;
  autoTask: AutoTask;
  routeReason: string;
}

/**
 * Resolve the Auto picker option to a concrete model for this turn.
 *
 * Only models the registry reports as available are considered, so Auto can
 * never select something the configured keys cannot serve.
 */
async function routeAuto(
  userId: string,
  input: { content: string; files: ReadonlyArray<{ mimeType: string }>; enabledTools?: readonly ChatToolId[] },
): Promise<AutoResolution> {
  const models = await modelRegistry.listPublicModels(userId);
  const plan = planAutoRoute(models, input);
  if (!plan.route) {
    const message =
      plan.task === "files"
        ? "No configured model can read this PDF. Add an OpenAI key, or pick a model, then send again."
        : plan.task === "vision"
          ? "No configured model can read this image. Add a Gemini or OpenAI key, or pick a model, then send again."
          : "No model is available for Auto. Add an API key, or pick a model, then send again.";
    throw new AppError(message, { statusCode: 503, code: "AUTO_ROUTE_UNAVAILABLE", expose: true });
  }
  const route = plan.route;
  const model =
    models.find((item) => item.providerId === route.providerId && item.id === route.modelId) ??
    (await modelRegistry.assertModelAvailable(route.providerId, route.modelId, userId));
  logger.info(
    {
      task: route.task,
      providerId: route.providerId,
      modelId: route.modelId,
      preferred: route.preferred,
      candidates: models.filter((item) => item.available).length,
    },
    "auto mode routed turn",
  );
  return {
    providerId: route.providerId,
    modelId: route.modelId,
    model,
    autoTask: route.task,
    routeReason: route.reason,
  };
}

/** What moved this turn off the requested model, for the SSE model event. */
function routeTrail(
  routed: { routedFrom?: string; routeReason?: string },
  autoPlan: AutoResolution | undefined,
): Pick<PreparedGeneration, "routedFrom" | "routeReason" | "autoTask"> {
  if (routed.routedFrom) {
    return {
      routedFrom: routed.routedFrom,
      ...(routed.routeReason ? { routeReason: routed.routeReason } : {}),
      ...(autoPlan ? { autoTask: autoPlan.autoTask } : {}),
    };
  }
  if (autoPlan) {
    return { routedFrom: AUTO_MODEL_ID, routeReason: autoPlan.routeReason, autoTask: autoPlan.autoTask };
  }
  return {};
}

async function routeForAttachments(
  userId: string,
  requested: { providerId: string; modelId: string; model: Awaited<ReturnType<typeof modelRegistry.assertModelAvailable>> },
  files: Array<{ mimeType: string }>,
): Promise<{
  providerId: string;
  modelId: string;
  model: Awaited<ReturnType<typeof modelRegistry.assertModelAvailable>>;
  routedFrom?: string;
  routeReason?: string;
}> {
  const need = attachmentNeed(files);
  if (need === "none") return requested;
  const models = await modelRegistry.listPublicModels(userId);
  const picked = pickMultimodalRoute(models, requested, need);
  if (!picked) {
    throw new AppError(
      need === "files"
        ? "No configured model can read this PDF. Add an OpenAI key, then send again."
        : "No configured model can read this image. Add a Gemini or OpenAI key, then send again.",
      { statusCode: 409, code: "ATTACHMENT_ROUTE_UNAVAILABLE", expose: true },
    );
  }
  if (!picked.rerouted) return requested;
  const model =
    models.find((item) => item.providerId === picked.providerId && item.id === picked.modelId) ??
    (await modelRegistry.assertModelAvailable(picked.providerId, picked.modelId, userId));
  logger.info(
    {
      fromProvider: requested.providerId,
      fromModel: requested.modelId,
      toProvider: picked.providerId,
      toModel: picked.modelId,
      need,
    },
    "attachment routed to a multimodal model",
  );
  return {
    providerId: picked.providerId,
    modelId: picked.modelId,
    model,
    routedFrom: requested.modelId,
    ...(picked.reason ? { routeReason: picked.reason } : {}),
  };
}

async function resolveExecutionModel(
  userId: string,
  providerId: string,
  modelId: string,
  /** True when the client named this model, as opposed to inheriting the thread's. */
  explicit = false,
): Promise<{ providerId: string; modelId: string; model: Awaited<ReturnType<typeof modelRegistry.assertModelAvailable>> }> {
  const executionModelId =
    providerId === "groq"
      ? resolveGroqModelId(modelId)
      : providerId === "gemini"
        ? resolveGeminiModelId(modelId)
        : providerId === "deepseek"
          ? resolveDeepSeekModelId(modelId)
          : modelId;
  try {
    const model = await modelRegistry.assertModelAvailable(providerId, executionModelId, userId);
    return { providerId, modelId: executionModelId, model };
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== "MODEL_UNAVAILABLE") throw error;
    const models = await modelRegistry.listPublicModels(userId);
    if (explicit) {
      // Substituting a default here is what answered a Pro selection with Lite
      // while the picker still read Pro. Refuse, and say what to do instead.
      const listed = models.find((item) => item.providerId === providerId && item.id === executionModelId)?.name;
      throw new AppError(
        `${describeSelectedModel(executionModelId, listed)} isn't available right now. Choose another model and send again.`,
        { statusCode: 400, code: "MODEL_UNAVAILABLE", expose: true },
      );
    }
    const gemini =
      models.find((model) => model.providerId === "gemini" && model.id === DEFAULT_GEMINI_MODEL_ID) ??
      models.find((model) => model.providerId === "gemini");
    if (gemini) return { providerId: gemini.providerId, modelId: gemini.id, model: gemini };
    const groq =
      models.find((model) => model.providerId === "groq" && model.id === DEFAULT_GROQ_MODEL_ID) ??
      models.find((model) => model.providerId === "groq");
    if (!groq) throw error;
    return { providerId: groq.providerId, modelId: groq.id, model: groq };
  }
}

async function currentUserTurn(userId: string, userMessage: PublicMessage): Promise<ChatMessage> {
  const attachments = userMessage.attachments ?? [];
  if (attachments.length === 0) {
    return { role: "user", content: userMessage.content };
  }
  const files = await loadOwnedFiles(
    userId,
    attachments.map((item) => item.fileId),
  );
  const materialized = await materializeFilesForModel(files);
  return {
    role: "user",
    content: [userMessage.content, materialized.contentSuffix].filter(Boolean).join("\n\n"),
    ...(materialized.parts.length > 0 ? { parts: materialized.parts } : {}),
  };
}

function withCurrentUser(history: ChatMessage[], current: ChatMessage): ChatMessage[] {
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
