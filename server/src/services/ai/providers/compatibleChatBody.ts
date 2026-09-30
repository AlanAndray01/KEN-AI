import type { GenerateRequest } from "../AIProvider.js";
import { getBuiltInProvider } from "../catalog.js";
import { toOpenAIMessages } from "../normalizers/normalize.js";
import { estimateContextTokens } from "../../chat/ContextManager.js";

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

/**
 * `none` (a 400 on 3.5 Flash Lite) becomes `minimal`, the smallest budget the
 * catalog accepts. Measured on 3.5 Flash Lite through this endpoint with the
 * same explanatory question: `low` took 3.9-13.6s to the first visible token,
 * `minimal` 0.56-0.92s, with answers of similar length. Turns that need the
 * thinking (math, code, depth) do not send `none`; see thinkingEffortFor.
 */
export function geminiReasoningParams(effort?: "none" | "low" | "medium" | "default"): Record<string, unknown> {
  if (effort === "medium" || effort === "default") return { reasoning_effort: "medium" };
  if (effort === "none") return { reasoning_effort: "minimal" };
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
 * Cloudflare's ceiling is on input+output *combined* (`max_total_tokens`), not
 * an output-only cap like Groq's — verified live per model, since Cloudflare's
 * own docs give only a "Context Window" figure without saying whether it is
 * one-sided: a 70B request asking for 100,000 output tokens came back
 * `max_total_tokens=24000` in the error body, confirming it covers both sides
 * of the request together.
 *
 * withProviderContextFit (AIProviderManager.ts) already re-trims the prompt to
 * fit this same ceiling before a request reaches here, but a deep-code turn
 * can still ask for up to 16,384 output tokens regardless of how much of the
 * ceiling the prompt already used — this is the second half of that guard,
 * shrinking the *output* ask to whatever room is actually left.
 *
 * Read from the catalog rather than a second hand-maintained table: the
 * catalog already carries the verified per-model figure, and a duplicate map
 * silently reverted every model it had not heard of to the 24,000 floor —
 * which, once the full Workers AI catalogue was exposed, was most of them.
 */
function cloudflareTotalTokens(modelId: string): number | undefined {
  return getBuiltInProvider("cloudflare")?.models.find((model) => model.id === modelId)?.contextWindow;
}

/** Matches the tightest known Cloudflare ceiling, since an unlisted model's real limit is unverified. */
const CLOUDFLARE_UNKNOWN_MODEL_TOTAL = 24_000;

/** Held back so estimator error (the ~4-chars/token heuristic) cannot still tip the request over. */
const CLOUDFLARE_SAFETY_MARGIN = 512;

/** Never request less than this — an unusably short reply is worse than risking a 400 on a huge prompt. */
const CLOUDFLARE_MIN_OUTPUT_TOKENS = 256;

function estimateMessagesTokens(messages: GenerateRequest["messages"]): number {
  return estimateContextTokens(messages);
}

export function cloudflareMaxTokens(
  modelId: string,
  messages: GenerateRequest["messages"],
  requested?: number,
): number {
  const total = cloudflareTotalTokens(modelId) ?? CLOUDFLARE_UNKNOWN_MODEL_TOTAL;
  const room = Math.max(CLOUDFLARE_MIN_OUTPUT_TOKENS, total - estimateMessagesTokens(messages) - CLOUDFLARE_SAFETY_MARGIN);
  return Math.min(requested ?? room, room);
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
    // Native PDF `type: "file"` is OpenAI-only. Groq, Gemini compat, and
    // Cloudflare receive document text from chat materialize, not unzipped here.
    messages: toOpenAIMessages(request.messages, { documents: options.providerId === "openai" }),
  };
  if (options.stream) {
    body.stream = true;
    // Final SSE frame carries prompt_tokens / completion_tokens. Without this,
    // streamed Groq and Cloudflare turns persist UsageRecord rows with no
    // counts, so the neuron leak is invisible.
    if (options.providerId === "groq" || options.providerId === "cloudflare" || options.providerId === "openai") {
      body.stream_options = { include_usage: true };
    }
  }

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

  if (options.providerId === "cloudflare") {
    body.max_tokens = cloudflareMaxTokens(request.modelId, request.messages, request.maxTokens);
    return body;
  }

  if (request.maxTokens) body.max_tokens = request.maxTokens;
  return body;
}
