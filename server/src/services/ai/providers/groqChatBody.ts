import type { GenerateRequest } from "../AIProvider.js";
import { toOpenAIMessages } from "../normalizers/normalize.js";

/**
 * Decode cap for a streamed Groq chat turn when the caller did not set one.
 *
 * Groq's free tier meters output tokens per minute (OTPM, 1000 on `on_demand`)
 * and rejects a request pre-flight when its *estimate* of the reply exceeds
 * what is left in that bucket. This value keeps an unbudgeted turn clear of it.
 *
 * It is deliberately no longer used to clamp callers that did ask for more.
 * OTPM is a refilling per-minute budget, not a per-request ceiling: measured
 * against the live API, one request returned 8192 completion tokens and another
 * 4975, both 200. Flattening every reply to 1000 truncated all of them to buy
 * protection the bucket does not actually need — a code answer was cut mid
 * function every single time, while an occasional 429 merely fails over.
 */
export const DEFAULT_GROQ_MAX_COMPLETION_TOKENS = 1_000;

/**
 * Real per-model output ceilings, read from Groq's own /models metadata
 * (`max_completion_tokens`). Asking above these is a hard 400, so they are the
 * one clamp worth keeping.
 */
const GROQ_MAX_COMPLETION_TOKENS: Readonly<Record<string, number>> = {
  "qwen/qwen3.8-27b": 16_384,
  "openai/gpt-oss-20b": 65_536,
  "openai/gpt-oss-120b": 65_536,
};

/** Conservative ceiling for a Groq id not in the table above. */
const GROQ_UNKNOWN_MODEL_CEILING = 8_192;

export function groqMaxCompletionTokens(modelId: string, requested?: number): number {
  const ceiling = GROQ_MAX_COMPLETION_TOKENS[modelId] ?? GROQ_UNKNOWN_MODEL_CEILING;
  return Math.min(requested ?? DEFAULT_GROQ_MAX_COMPLETION_TOKENS, ceiling);
}

/**
 * GPT-OSS cannot turn reasoning off (`none` is a Qwen-only value). `low` is the
 * smallest thinking budget Groq accepts, and it is what makes time-to-first
 * *visible* token drop from several seconds to well under one.
 */
export function groqReasoningParams(
  modelId: string,
  effort?: "none" | "low" | "medium" | "default",
): Record<string, unknown> {
  if (modelId.startsWith("openai/gpt-oss")) {
    return { reasoning_effort: effort === "medium" ? "medium" : "low", include_reasoning: false };
  }
  if (modelId.startsWith("qwen/qwen3")) {
    if (effort === "none" || effort === undefined) return { reasoning_effort: "none" };
    return { reasoning_effort: "default" };
  }
  return {};
}

/**
 * Gemini 3.x Flash thinks by default and counts those hidden tokens against
 * `max_tokens`. A short factual question is budgeted at 1024 visible tokens;
 * without a reserve the model hits `length` mid-sentence after thinking
 * (DevTools: "…he is officially", 4.5s, `gemini-3.8-flash`).
 * `none` is a 400 on 3.5 Flash Lite and 3.6 Flash. `low` is accepted across
 * the catalog.
 */
export const GEMINI_THINKING_TOKEN_RESERVE = 2_048;
/** Headroom when thinking is already pinned to `low` — not a second essay budget. */
export const GEMINI_LOW_THINKING_TOKEN_RESERVE = 256;

export function geminiReasoningParams(effort?: "none" | "low" | "medium" | "default"): Record<string, unknown> {
  if (effort === "medium" || effort === "default") return { reasoning_effort: "medium" };
  return { reasoning_effort: "low" };
}

export function geminiMaxOutputTokens(
  visibleTokens?: number,
  effort?: "none" | "low" | "medium" | "default",
): number {
  const visible = visibleTokens ?? 1_024;
  if (effort === "none" || effort === "low") {
    return visible + GEMINI_LOW_THINKING_TOKEN_RESERVE;
  }
  return visible + GEMINI_THINKING_TOKEN_RESERVE;
}

/**
 * OpenAI-compatible chat/completions body. Groq's GPT-OSS family counts
 * reasoning tokens against `max_completion_tokens`, so that field is used
 * instead of `max_tokens` on the Groq adapter.
 */
export function buildCompatibleChatBody(
  request: GenerateRequest,
  options: { stream: boolean; providerId: string },
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: request.modelId,
    // Only OpenAI's own endpoint accepts `type: "file"` blocks; every other
    // compatible surface 400s on them, so PDFs are gated to that adapter.
    messages: toOpenAIMessages(request.messages, { documents: options.providerId === "openai" }),
  };
  if (options.stream) body.stream = true;

  if (options.providerId === "groq") {
    Object.assign(body, groqReasoningParams(request.modelId, request.reasoningEffort));
    body.temperature = 0.6;
    body.max_completion_tokens = groqMaxCompletionTokens(request.modelId, request.maxTokens);
    return body;
  }

  if (options.providerId === "gemini") {
    Object.assign(body, geminiReasoningParams(request.reasoningEffort));
    body.max_tokens = geminiMaxOutputTokens(request.maxTokens, request.reasoningEffort);
    return body;
  }

  if (request.maxTokens) body.max_tokens = request.maxTokens;
  return body;
}
