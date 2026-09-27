import { MODEL_COOLDOWN_REASON } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { Message } from "../../models/Message.js";
import { telemetry } from "../../utils/telemetry.js";
import { findOwnedConversation } from "./conversationService.js";
import { generateChatTitle } from "./chatTitle.js";
import { refreshConversationSummary, SUMMARY_KEEP_RECENT, SUMMARY_REFRESH_AFTER } from "./conversationSummary.js";
import { detectDeepCodeRequest } from "./codeGeneration.js";
import { estimateGenerationMs } from "./generationEstimate.js";
import { generationRegistry } from "./generationRegistry.js";
import { nextOpenGeminiModelId, peekModelSkip } from "../ai/modelSkip.js";
import { buildSseTiming, type SseTiming } from "../../utils/sse.js";
import { toPublicConversation, toPublicMessage } from "./toPublic.js";
import { recordUsage } from "./usageService.js";
import { asRecord } from "./prepareHelpers.js";
import { loadMessageAttachments, streamAssistantReply, type StreamClockState } from "./streamTurn.js";
import type { ChatMessage } from "../ai/AIProvider.js";
import type { ChatStreamEvent, GenerationRuntime, PreparedGeneration } from "./generationTypes.js";

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

  let finishStatus: "complete" | "aborted" | "error" = "complete";
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let truncated = false;
  const streamProviderId = prepared.providerId;
  let streamModelId = prepared.modelId;
  let partial = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let estimatedInputTokens: number | undefined;

  const clockState: StreamClockState = {
    executedProviderId: prepared.providerId,
    executedModelId: prepared.modelId,
  };

  if (prepared.routedFrom) {
    clockState.fallbackFrom = prepared.routedFrom;
    if (prepared.routeReason) clockState.fallbackReason = prepared.routeReason;
  }

  const skip = prepared.autoTask ? peekModelSkip(prepared.providerId, prepared.modelId) : undefined;
  // Auto turns only. A remembered quota error may start an Auto turn on another
  // model, because Auto never promised a particular one. A pinned turn is tried
  // on the model the user picked even mid-cooldown: pre-empting it here is what
  // silently answered a Pro selection with Flash Lite on every turn for the ten
  // minutes a quota skip lasts. If the model really is still limited, the
  // quota-only fallback below still moves the turn — and reports the hop.
  if (skip && skip.code === "PROVIDER_RATE_LIMITED" && prepared.providerId === "gemini") {
    const next = nextOpenGeminiModelId(prepared.modelId);
    if (next) {
      streamModelId = next;
      clockState.executedModelId = next;
      clockState.fallbackFrom = prepared.modelId;
      // Tagged as a cooldown, not a fresh failure. Nothing failed on this turn —
      // the model is simply still inside a skip recorded earlier, which lasts up
      // to ten minutes for a quota error. Reporting it as a new fallback is what
      // made the notification fire on every message for that whole window.
      // The real reason stays appended for logs and the timing frame.
      clockState.fallbackReason = `${MODEL_COOLDOWN_REASON}|${skip.reason}`;
      logger.info(
        telemetry({
          event: "model_skip_hop",
          providerId: prepared.providerId,
          fromModel: prepared.modelId,
          toModel: next,
          skipReason: skip.reason,
          skipCode: skip.code,
          hop: true,
          autoTask: prepared.autoTask,
        }),
        "auto turn hopped off a cooled-down model",
      );
    }
  }

  const startAssistant =
    clockState.executedModelId !== prepared.modelId
      ? { ...prepared.assistantMessage, model: clockState.executedModelId, provider: clockState.executedProviderId }
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
    providerId: clockState.executedProviderId,
    modelId: clockState.executedModelId,
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
  if (clockState.fallbackFrom) {
    emit({
      type: "model",
      model: clockState.executedModelId,
      provider: clockState.executedProviderId,
      activeModel: clockState.executedModelId,
      fallbackFrom: clockState.fallbackFrom,
      assistantMessage: startAssistant,
      ...(clockState.fallbackReason ? { fallbackReason: clockState.fallbackReason } : {}),
      ...(prepared.modelName ? { modelName: prepared.modelName } : {}),
      ...(prepared.autoTask ? { autoTask: prepared.autoTask } : {}),
    });
  }

  const emitTiming = (extra: Partial<SseTiming> = {}): void => {
    const payload = buildSseTiming({
      requestedModel: prepared.modelId,
      activeModel: clockState.executedModelId,
      ttfbMs,
      ...(requestId ? { requestId } : {}),
      ...(clockState.fallbackFrom ? { fallbackFrom: clockState.fallbackFrom } : {}),
      ...(clockState.fallbackReason ? { fallbackReason: clockState.fallbackReason } : {}),
      ...(clockState.googleConnectMs !== undefined ? { googleConnectMs: clockState.googleConnectMs } : {}),
      ...(clockState.firstVisibleChunkMs !== undefined ? { firstVisibleChunkMs: clockState.firstVisibleChunkMs } : {}),
      ...extra,
    });
    logger.info(
      telemetry({
        event: "chat_stream_timing",
        requestId,
        requestedModel: payload.requestedModel,
        activeModel: payload.activeModel,
        ttfbMs: payload.ttfbMs,
        fallbackFrom: payload.fallbackFrom,
        fallbackReason: payload.fallbackReason,
        googleConnectMs: payload.googleConnectMs,
        firstVisibleChunkMs: payload.firstVisibleChunkMs,
        completeMs: payload.completeMs,
        hop: Boolean(clockState.fallbackFrom),
        imageOnly: prepared.imageOnly ?? false,
        imageGenerated: prepared.imageGenerated ?? false,
        autoTask: prepared.autoTask,
      }),
      "chat stream timing",
    );
    emit(payload);
  };
  if (clockState.fallbackFrom) emitTiming();

  if (!prepared.imageOnly) {
    const streamed = await streamAssistantReply({
      prepared,
      emit,
      emitTiming,
      clock,
      streamProviderId,
      streamModelId,
      clockState,
      ...(requestId ? { requestId } : {}),
      ...(preloaded ? { preloaded } : {}),
    });
    partial = streamed.partial;
    finishStatus = streamed.finishStatus;
    truncated = streamed.truncated;
    inputTokens = streamed.inputTokens;
    outputTokens = streamed.outputTokens;
    estimatedInputTokens = streamed.estimatedInputTokens;
    errorCode = streamed.errorCode;
    errorMessage = streamed.errorMessage;
  }

  const assistantAttachments = await loadMessageAttachments(
    prepared.assistantMessage.id,
    prepared.assistantMessage.attachments,
  );
  // The picture is the reply. A failed caption must not hide it behind
  // "generation failed" or re-attribute it to the user's prompt.
  if (finishStatus === "error" && prepared.imageGenerated && assistantAttachments.length > 0) {
    finishStatus = "complete";
    errorCode = undefined;
    errorMessage = undefined;
  }

  const assistant = await Message.findById(prepared.assistantMessage.id);
  if (assistant) {
    assistant.content = partial;
    assistant.status = finishStatus;
    assistant.set("model", clockState.executedModelId);
    assistant.set("provider", clockState.executedProviderId);
    if (prepared.autoTask) {
      // Kept on the reply so a reloaded thread still shows that Auto chose it.
      assistant.set("metadata", { ...(asRecord(assistant.metadata) ?? {}), autoTask: prepared.autoTask });
    }
    if (truncated) {
      // Persisted, not just streamed, so reopening the thread still shows the
      // reply was cut rather than presenting a half file as the whole answer.
      assistant.set("metadata", { ...(asRecord(assistant.metadata) ?? {}), truncated: true });
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
    providerId: clockState.executedProviderId,
    modelId: clockState.executedModelId,
    conversationId: prepared.conversationId,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(estimatedInputTokens !== undefined ? { estimatedInputTokens } : {}),
    durationMs: Date.now() - started,
    // Feeds the next turn's estimate: deep-code durations are pooled separately
    // from ordinary replies so neither skews the other's median.
    deepCode,
    success: finishStatus !== "error",
    ...(errorCode ? { errorCode } : {}),
    route,
  });

  const publicAssistant = assistant
    ? toPublicMessage(assistant, assistantAttachments)
    : { ...prepared.assistantMessage, ...(assistantAttachments.length > 0 ? { attachments: assistantAttachments } : {}) };
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
    { ...prepared, providerId: clockState.executedProviderId, modelId: clockState.executedModelId },
    partial,
    finishStatus,
  );

  // Folds turns leaving the recent window into the rolling summary. After the
  // reply, never before it, so the user never waits on it; and only once the
  // thread is long enough that a turn could have left the window at all.
  if ((conversation.messageCount ?? 0) >= SUMMARY_KEEP_RECENT + SUMMARY_REFRESH_AFTER) {
    void refreshConversationSummary({
      userId: prepared.userId,
      conversationId: prepared.conversationId,
      providerId: clockState.executedProviderId,
      modelId: clockState.executedModelId,
    });
  }
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
