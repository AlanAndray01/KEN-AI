import type { GenerateRequest } from "../AIProvider.js";
import { toOpenAIMessages } from "../normalizers/normalize.js";

/**
 * Default decode cap for a streamed Groq chat turn when the caller did not set one.
 * Groq free-tier OTPM is 1000; requesting 2048 fails the whole turn with 429.
 */
export const DEFAULT_GROQ_MAX_COMPLETION_TOKENS = 1_000;

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
    body.max_completion_tokens = Math.min(
      request.maxTokens ?? DEFAULT_GROQ_MAX_COMPLETION_TOKENS,
      DEFAULT_GROQ_MAX_COMPLETION_TOKENS,
    );
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
