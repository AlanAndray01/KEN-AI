import type { PublicAttachment } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { isAbortError, isTimeoutAbort } from "../../utils/abort.js";
import { toSafeError } from "../../utils/redact.js";
import { telemetry } from "../../utils/telemetry.js";
import type { ChatMessage, StreamEvent } from "../ai/AIProvider.js";
import { aiProviderManager } from "../ai/AIProviderManager.js";
import { estimateContextTokens } from "./ContextManager.js";
import { buildDeepCodeMessage, detectDeepCodeRequest } from "./codeGeneration.js";
import { neuronOutputTokens, pruneTurnContext } from "./neuronGuardrail.js";
import { buildResponsePolicyMessages, detectTaskSignals, replyMaxTokens, thinkingEffortFor } from "./responsePolicy.js";
import type { SseTiming } from "../../utils/sse.js";
import { Message } from "../../models/Message.js";
import { describeSelectedModel } from "./identity.js";
import { currentUserTurn, loadHistory, withCurrentUser } from "./loadHistory.js";
import { safeEarlierDocumentContext } from "./documentContext.js";
import { buildPersonaMessages } from "../memory/persona.js";
import { publicAttachmentsForMessages } from "../storage/fileService.js";
import type { ChatStreamEvent, PreparedGeneration } from "./generationTypes.js";

export interface StreamTurnState {
  partial: string;
  inputTokens?: number;
  outputTokens?: number;
  estimatedInputTokens?: number;
  finishStatus: "complete" | "aborted" | "error";
  errorCode?: string;
  errorMessage?: string;
  executedProviderId: string;
  executedModelId: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  truncated: boolean;
  googleConnectMs?: number;
  firstVisibleChunkMs?: number;
}

/** Live fields `emitTiming` reads while the stream is still open. */
export interface StreamClockState {
  executedProviderId: string;
  executedModelId: string;
  fallbackFrom?: string;
  fallbackReason?: string;
  googleConnectMs?: number;
  firstVisibleChunkMs?: number;
}

/**
 * Orders a turn's prompt so it opens with the parts that stay the same from
 * one send to the next.
 *
 * Providers that cache prompts (Gemini, Groq, OpenAI) reuse a request's
 * unchanged opening, which is cheaper and faster. The reply policy is
 * rebuilt for every question, so while it sat second — ahead of persona and
 * summary — the reusable part ended after the identity block. Now the order
 * is identity and protocol, persona, the rolling summary, then everything
 * that varies per turn, then the conversation itself.
 */
/** Whether the recent turns contain LaTeX, so a terse follow-up still gets the full math rules. */
export function threadUsesMath(history: ChatMessage[]): boolean {
  return history
    .slice(-4)
    .some((message) => message.role !== "system" && /\$\$|\\frac|\\begin\{|\\\(/.test(message.content));
}

export function orderForPromptCache(input: {
  /** [stable identity/protocol, per-turn reply policy], as buildResponsePolicyMessages returns them. */
  policy: ChatMessage[];
  persona: ChatMessage[];
  perTurn: ChatMessage[];
  history: ChatMessage[];
  currentUser: ChatMessage;
}): ChatMessage[] {
  const [stable, ...turnPolicy] = input.policy;
  const summary = input.history.filter((message) => message.kind === "summary");
  const turns = input.history.filter((message) => message.kind !== "summary");
  return [
    ...(stable ? [stable] : []),
    ...input.persona,
    ...summary,
    ...turnPolicy,
    ...input.perTurn,
    ...withCurrentUser(turns, input.currentUser),
  ];
}

export async function streamAssistantReply(input: {
  prepared: PreparedGeneration;
  emit: (event: ChatStreamEvent) => void;
  emitTiming: (extra?: Partial<SseTiming>) => void;
  clock: number;
  requestId?: string;
  streamProviderId: string;
  streamModelId: string;
  clockState: StreamClockState;
  preloaded?: { history: ChatMessage[]; persona: ChatMessage[] };
}): Promise<StreamTurnState> {
  const { prepared, emit, emitTiming, clock, requestId, clockState } = input;
  let partial = "";
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let finishStatus: StreamTurnState["finishStatus"] = "complete";
  let errorCode: string | undefined;
  let errorMessage: string | undefined;
  let truncated = false;
  let estimatedInputTokens: number | undefined;

  try {
    const signals = detectTaskSignals(prepared.userMessage.content);
    const hasAttachments =
      (prepared.userMessage.attachments?.length ?? 0) > 0 || (prepared.generatedFileIds?.length ?? 0) > 0;
    // Preload races persist, so the new turn (and its files) is often missing
    // from history. Never drop attachments just because the text is small talk.
    const casual = signals.budget === "minimal" && !hasAttachments;
    const deepCode = detectDeepCodeRequest(prepared.userMessage.content);
    const lowThinking = thinkingEffortFor(signals, deepCode) === "none";
    // Started before this turn's own files and the history are awaited, so all
    // three lookups overlap instead of queueing in front of the first token.
    const earlierDocumentsP = casual
      ? Promise.resolve(undefined)
      : safeEarlierDocumentContext({
          userId: prepared.userId,
          conversationId: prepared.conversationId,
          currentMessageId: prepared.userMessage.id,
          question: prepared.userMessage.content,
          providerId: prepared.providerId,
        });
    const currentUser = await currentUserTurn(
      prepared.userId,
      prepared.userMessage,
      prepared.generatedFileIds,
      prepared.providerId,
    );
    const [history, persona] = casual
      ? [[], []]
      : input.preloaded
        ? [input.preloaded.history, input.preloaded.persona]
        : await Promise.all([
            loadHistory(prepared.userId, prepared.conversationId),
            buildPersonaMessages(prepared.userId, prepared.customGptId),
          ]);
    // Sections of files attached on earlier turns that this question is about.
    const earlierDocuments = await earlierDocumentsP;
    const questionTurn = earlierDocuments
      ? { ...currentUser, content: [currentUser.content, earlierDocuments].filter(Boolean).join("\n\n") }
      : currentUser;
    const messages = pruneTurnContext({
      messages: casual
        ? [
            ...buildResponsePolicyMessages(prepared.userMessage.content, {
              modelName: prepared.modelName,
            }),
            currentUser,
          ]
        : orderForPromptCache({
            policy: buildResponsePolicyMessages(prepared.userMessage.content, {
              skipProtocol: Boolean(prepared.customGptId),
              modelName: prepared.modelName,
              mathContext: threadUsesMath(history),
            }),
            persona,
            // A code turn's extra rules and this turn's tool results change
            // from send to send, so they sit with the per-turn policy.
            perTurn: [...(deepCode ? [buildDeepCodeMessage()] : []), ...(prepared.toolSystemMessages ?? [])],
            history,
            currentUser: questionTurn,
          }),
      modelId: prepared.modelId,
      providerId: prepared.providerId,
      tier: prepared.neuronTier,
      ...(prepared.contextWindow ? { contextWindow: prepared.contextWindow } : {}),
    });
    estimatedInputTokens = estimateContextTokens(messages);
    logger.info(
      telemetry({
        event: "chat_generation_context",
        requestId,
        providerId: prepared.providerId,
        modelId: prepared.modelId,
        streamProviderId: input.streamProviderId,
        streamModelId: input.streamModelId,
        estimatedInputTokens,
        historyMessages: messages.filter((message) => message.role !== "system").length,
        systemMessages: messages.filter((message) => message.role === "system").length,
        hop: input.streamModelId !== prepared.modelId,
        imageOnly: prepared.imageOnly ?? false,
        imageGenerated: prepared.imageGenerated ?? false,
        autoTask: prepared.autoTask,
      }),
      "chat generation context",
    );

    let chunks = 0;
    // A deep code turn is truncated by the medium budget: the reply gets cut
    // mid-function, which is worse than no answer. Floor it at the long budget.
    const maxTokens = neuronOutputTokens(
      prepared.neuronTier,
      prepared.providerId,
      deepCode ? Math.max(replyMaxTokens(signals.budget), replyMaxTokens("long")) : replyMaxTokens(signals.budget),
    );
    for await (const event of aiProviderManager.stream({
      providerId: input.streamProviderId,
      modelId: input.streamModelId,
      messages,
      userId: prepared.userId,
      abortSignal: prepared.abortSignal,
      maxTokens,
      skipAvailabilityCheck: true,
      // A model the user picked is never swapped: quota, high demand, and
      // cooldown all surface as an error on that id so the picker still matches
      // the reply. Auto keeps retryable failover. An image turn already spent
      // Flux — the caption may hop so a Gemini miss does not hide the picture.
      ...(prepared.autoTask || prepared.imageGenerated ? {} : { fallbackPolicy: "none" as const }),
      ...(requestId ? { requestId } : {}),
      ...(lowThinking ? { reasoningEffort: "none" as const } : {}),
    })) {
      if (prepared.abortSignal.aborted) {
        finishStatus = "aborted";
        break;
      }
      if (event.type === "fallback") {
        logger.info(
          telemetry({
            event: "chat_stream_hop",
            requestId,
            fromModel: event.fallbackFrom,
            toModel: event.model,
            toProvider: event.provider,
            fallbackReason: event.fallbackReason,
            hop: true,
            imageGenerated: prepared.imageGenerated ?? false,
            autoTask: prepared.autoTask,
          }),
          "chat stream failed over",
        );
        clockState.executedModelId = event.model;
        clockState.executedProviderId = event.provider;
        clockState.fallbackFrom = event.fallbackFrom;
        clockState.fallbackReason = event.fallbackReason;
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
        ).catch((error: unknown) => logBackgroundWriteFailure(error, "assistant model", requestId));
      }
      if (event.type === "connected") {
        clockState.googleConnectMs = event.connectMs;
      }
      applyStreamEvent(event, (text) => {
        if (clockState.firstVisibleChunkMs === undefined) {
          clockState.firstVisibleChunkMs = Date.now() - clock;
          emitTiming({ firstVisibleChunkMs: clockState.firstVisibleChunkMs });
        }
        partial += text;
        emit({ type: "chunk", text });
      });
      chunks += 1;
      // Checkpoint only: the final save in runGeneration is what persists the
      // reply, so a failed checkpoint is logged and the stream carries on.
      if (chunks % 12 === 0 && partial) {
        void Message.updateOne({ _id: prepared.assistantMessage.id }, { $set: { content: partial } }).catch(
          (error: unknown) => logBackgroundWriteFailure(error, "partial reply checkpoint", requestId),
        );
      }
      if (event.type === "complete") {
        partial = event.response.content || partial;
        inputTokens = event.response.usage?.inputTokens;
        outputTokens = event.response.usage?.outputTokens;
        logger.info(
          telemetry({
            event: "chat_prompt_cache",
            requestId,
            providerId: event.response.provider,
            modelId: event.response.model,
            inputTokens,
            // Absent when the provider does not report caching; 0 when it
            // reports it and nothing was reused.
            cachedInputTokens: event.response.usage?.cachedInputTokens,
            estimatedInputTokens,
          }),
          "chat prompt cache usage",
        );
        if (event.response.provider) clockState.executedProviderId = event.response.provider;
        if (event.response.model) clockState.executedModelId = event.response.model;
        if (event.response.metadata && event.response.metadata["aborted"] === true) {
          finishStatus = "aborted";
        }
        // "length" means the decode ceiling stopped the model, not the model
        // itself — the reply ends mid-sentence, and on a code turn that is mid
        // function. Saying so is the difference between a visibly incomplete
        // answer and one that silently looks finished but is not.
        if (event.response.finishReason === "length") {
          truncated = true;
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
          ...telemetry({
            event: "chat_generation_failed",
            requestId,
            providerId: prepared.providerId,
            modelId: prepared.modelId,
            streamProviderId: input.streamProviderId,
            streamModelId: input.streamModelId,
            errorCode,
            imageGenerated: prepared.imageGenerated ?? false,
            autoTask: prepared.autoTask,
          }),
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

  return {
    partial,
    ...(inputTokens !== undefined ? { inputTokens } : {}),
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(estimatedInputTokens !== undefined ? { estimatedInputTokens } : {}),
    finishStatus,
    ...(errorCode ? { errorCode } : {}),
    ...(errorMessage ? { errorMessage } : {}),
    executedProviderId: clockState.executedProviderId,
    executedModelId: clockState.executedModelId,
    ...(clockState.fallbackFrom ? { fallbackFrom: clockState.fallbackFrom } : {}),
    ...(clockState.fallbackReason ? { fallbackReason: clockState.fallbackReason } : {}),
    truncated,
    ...(clockState.googleConnectMs !== undefined ? { googleConnectMs: clockState.googleConnectMs } : {}),
    ...(clockState.firstVisibleChunkMs !== undefined ? { firstVisibleChunkMs: clockState.firstVisibleChunkMs } : {}),
  };
}

export async function loadMessageAttachments(
  messageId: string,
  fallback?: PublicAttachment[],
): Promise<PublicAttachment[]> {
  const map = await publicAttachmentsForMessages([messageId]);
  const stored = map.get(messageId) ?? [];
  if (stored.length > 0) return stored;
  return fallback ?? [];
}

function logBackgroundWriteFailure(error: unknown, what: string, requestId?: string): void {
  logger.warn({ err: toSafeError(error), requestId }, `background ${what} write failed`);
}

function applyStreamEvent(event: StreamEvent, onChunk: (text: string) => void): void {
  if (event.type === "chunk" && event.text) {
    onChunk(event.text);
  }
}
