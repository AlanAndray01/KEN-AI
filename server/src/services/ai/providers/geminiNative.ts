import { logger } from "../../../config/logger.js";
import { AppError } from "../../../utils/AppError.js";
import { combineAbortSignals, isAbortError } from "../../../utils/abort.js";
import { toSafeError } from "../../../utils/redact.js";
import { iterateSseData } from "../../../utils/sse.js";
import type { AIResponse, ChatMessage, GenerateRequest, StreamEvent } from "../AIProvider.js";
import { GATEWAY_URL_PREFIX } from "../aiGateway.js";
import { compactUsage, normalizeAIResponse, toProviderContents } from "../normalizers/normalize.js";
import { geminiMaxOutputTokens } from "./compatibleChatBody.js";
import { geminiEmptyReplyError } from "./geminiReply.js";
import { parseProviderHttpError } from "./OpenAICompatibleProvider.js";

/** Native Gemini generateContent surface (not the OpenAI-compat `/openai` prefix). */
export const GEMINI_NATIVE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

export function requestHasInlineMedia(messages: ChatMessage[]): boolean {
  return messages.some((message) =>
    (message.parts ?? []).some((part) => part.mimeType.startsWith("image/") || part.mimeType === "application/pdf"),
  );
}

export function nativeGeminiUrl(modelId: string, stream: boolean, baseUrl?: string): string {
  const encoded = encodeURIComponent(modelId);
  const base = (baseUrl || GEMINI_NATIVE_BASE_URL).replace(/\/$/, "");
  const method = stream ? "streamGenerateContent" : "generateContent";
  const query = stream ? "?alt=sse" : "";
  // Cloudflare's Google AI Studio native path is `/v1/models/{id}:generateContent`
  // off the slug — not Google's `/v1beta/models/...`. The compat hop still uses
  // `/v1beta/openai`; mixing that prefix into native is what 401'd image/PDF turns.
  if (base.startsWith(GATEWAY_URL_PREFIX)) {
    return `${base}/v1/models/${encoded}:${method}${query}`;
  }
  return `${base}/models/${encoded}:${method}${query}`;
}

/** Credentials a native call needs: the vendor key, plus gateway addressing when it is on. */
export interface NativeGeminiAuth {
  apiKey: string;
  baseUrl?: string;
  gatewayToken?: string;
}

/**
 * Native generateContent body. Images and PDFs stay as `inlineData` parts so
 * Gemini actually reads the attachment instead of seeing text-only history.
 */
export function buildNativeGeminiBody(request: GenerateRequest): Record<string, unknown> {
  const { system, contents } = toProviderContents(request.messages);
  const body: Record<string, unknown> = { contents };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  body.generationConfig = {
    maxOutputTokens: geminiMaxOutputTokens(request.maxTokens, request.reasoningEffort),
    // Same fast path as the compat endpoint's `minimal`. Anything else keeps
    // the model's default thinking, which on this surface was already quick.
    ...(request.reasoningEffort === "none" ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
  };
  return body;
}

export function extractGeminiCandidateText(payload: unknown): {
  text: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number; cachedInputTokens?: number };
} {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = candidates[0] && typeof candidates[0] === "object" ? (candidates[0] as Record<string, unknown>) : {};
  const content = first.content && typeof first.content === "object" ? (first.content as Record<string, unknown>) : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  const text = parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const record = part as { text?: unknown; thought?: unknown };
      if (record.thought === true) return "";
      return typeof record.text === "string" ? record.text : "";
    })
    .join("");
  const finishReason = typeof first.finishReason === "string" ? first.finishReason : undefined;
  const usageMeta =
    root.usageMetadata && typeof root.usageMetadata === "object"
      ? (root.usageMetadata as Record<string, unknown>)
      : undefined;
  const usage = usageMeta
    ? {
        ...(typeof usageMeta.promptTokenCount === "number" ? { inputTokens: usageMeta.promptTokenCount } : {}),
        ...(typeof usageMeta.candidatesTokenCount === "number" ? { outputTokens: usageMeta.candidatesTokenCount } : {}),
        ...(typeof usageMeta.totalTokenCount === "number" ? { totalTokens: usageMeta.totalTokenCount } : {}),
        ...(typeof usageMeta.cachedContentTokenCount === "number"
          ? { cachedInputTokens: usageMeta.cachedContentTokenCount }
          : {}),
      }
    : undefined;
  return {
    text,
    ...(finishReason ? { finishReason } : {}),
    ...(usage && Object.keys(usage).length > 0 ? { usage } : {}),
  };
}

export async function generateNativeGemini(request: GenerateRequest, auth: NativeGeminiAuth): Promise<AIResponse> {
  const fetched = await fetchNativeGemini(request, auth, false);
  if (!fetched.response.ok) {
    await throwNativeGeminiError(fetched.response, request.modelId, fetched.connectMs);
  }
  const payload = (await fetched.response.json()) as unknown;
  const extracted = extractGeminiCandidateText(payload);
  const empty = geminiEmptyReplyError({
    text: extracted.text,
    ...(extracted.finishReason ? { finishReason: extracted.finishReason } : {}),
    payload,
    candidateCount: Array.isArray((payload as { candidates?: unknown[] })?.candidates)
      ? (payload as { candidates: unknown[] }).candidates.length
      : 0,
  });
  if (empty) throw empty;
  return normalizeAIResponse({
    content: extracted.text,
    model: request.modelId,
    provider: "gemini",
    finishReason: extracted.finishReason ?? "stop",
    ...(extracted.usage ? { usage: extracted.usage } : {}),
  });
}

export async function* streamNativeGemini(
  request: GenerateRequest,
  auth: NativeGeminiAuth,
): AsyncIterable<StreamEvent> {
  yield { type: "start", model: request.modelId, provider: "gemini" };
  let content = "";
  let finishReason = "stop";
  let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

  try {
    const fetched = await fetchNativeGemini(request, auth, true);
    if (!fetched.response.ok) {
      await throwNativeGeminiError(fetched.response, request.modelId, fetched.connectMs);
    }
    yield { type: "connected", model: request.modelId, provider: "gemini", connectMs: fetched.connectMs };

    for await (const payload of iterateSseData(fetched.response, request.abortSignal)) {
      if (request.abortSignal?.aborted) break;
      try {
        const extracted = extractGeminiCandidateText(JSON.parse(payload) as unknown);
        if (extracted.text) {
          content += extracted.text;
          yield { type: "chunk", text: extracted.text };
        }
        if (extracted.finishReason) finishReason = extracted.finishReason;
        if (extracted.usage) usage = compactUsage(extracted.usage) ?? usage;
      } catch {
        // Ignore malformed keep-alive frames.
      }
    }
  } catch (error) {
    if (!isAbortError(error) && !request.abortSignal?.aborted) {
      if (error instanceof AppError) throw error;
      throw toSafeError(error);
    }
  }

  const empty = geminiEmptyReplyError({
    text: content,
    finishReason,
  });
  if (empty && !request.abortSignal?.aborted) throw empty;

  yield {
    type: "complete",
    response: normalizeAIResponse({
      content,
      model: request.modelId,
      provider: "gemini",
      finishReason: request.abortSignal?.aborted ? "unknown" : finishReason,
      ...(usage ? { usage } : {}),
      ...(request.abortSignal?.aborted ? { metadata: { aborted: true } } : {}),
    }),
  };
}

async function fetchNativeGemini(
  request: GenerateRequest,
  auth: NativeGeminiAuth,
  stream: boolean,
): Promise<{ response: Response; connectMs: number }> {
  const first = await postNativeGemini(request, auth, stream);
  if (
    !first.response.ok &&
    (first.response.status === 401 || first.response.status === 403 || first.response.status === 404) &&
    auth.baseUrl?.startsWith(GATEWAY_URL_PREFIX)
  ) {
    logger.warn(
      { status: first.response.status, modelId: request.modelId },
      "native Gemini via AI Gateway failed; retrying Google directly",
    );
    await first.response.arrayBuffer();
    return postNativeGemini(request, { apiKey: auth.apiKey }, stream);
  }
  return first;
}

async function postNativeGemini(
  request: GenerateRequest,
  auth: NativeGeminiAuth,
  stream: boolean,
): Promise<{ response: Response; connectMs: number }> {
  const started = Date.now();
  const firstByte = new AbortController();
  const timer =
    request.firstByteTimeoutMs && request.firstByteTimeoutMs > 0
      ? setTimeout(() => {
          firstByte.abort(Object.assign(new Error("Provider first-byte timeout"), { name: "TimeoutError" }));
        }, request.firstByteTimeoutMs)
      : undefined;
  try {
    const response = await fetch(nativeGeminiUrl(request.modelId, stream, auth.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": auth.apiKey,
        ...(auth.gatewayToken ? { "cf-aig-authorization": `Bearer ${auth.gatewayToken}` } : {}),
        ...(stream ? { Accept: "text/event-stream" } : {}),
      },
      body: JSON.stringify(buildNativeGeminiBody(request)),
      signal: combineAbortSignals(request.abortSignal, firstByte.signal),
    });
    return { response, connectMs: Date.now() - started };
  } catch (error) {
    if (firstByte.signal.aborted && !request.abortSignal?.aborted) {
      throw new AppError("Provider did not respond in time.", {
        statusCode: 503,
        code: "PROVIDER_UNAVAILABLE",
        extra: { httpStatus: 503, errorClass: "first_byte_timeout", connectMs: Date.now() - started },
      });
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function throwNativeGeminiError(response: Response, modelId: string, connectMs: number): Promise<never> {
  const bodyText = await response.text();
  throw parseProviderHttpError(response.status, bodyText, "gemini", { connectMs, modelId });
}
