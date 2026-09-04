import type { GenerateRequest } from "../AIProvider.js";
import { toOpenAIMessages } from "../normalizers/normalize.js";

/** Default decode cap for a streamed Groq chat turn when the caller did not set one. */
export const DEFAULT_GROQ_MAX_COMPLETION_TOKENS = 2_048;

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
    messages: toOpenAIMessages(request.messages),
  };
  if (options.stream) body.stream = true;

  if (options.providerId === "groq") {
    Object.assign(body, groqReasoningParams(request.modelId, request.reasoningEffort));
    body.temperature = 0.6;
    body.max_completion_tokens = request.maxTokens ?? DEFAULT_GROQ_MAX_COMPLETION_TOKENS;
    return body;
  }

  if (request.maxTokens) body.max_tokens = request.maxTokens;
  return body;
}
