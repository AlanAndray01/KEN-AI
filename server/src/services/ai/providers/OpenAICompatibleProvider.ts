import type { ProviderType } from "@Ken/shared";
import { logger } from "../../../config/logger.js";
import { AppError } from "../../../utils/AppError.js";
import { isAbortError } from "../../../utils/abort.js";
import { redactSensitive, toSafeError } from "../../../utils/redact.js";
import { iterateSseData } from "../../../utils/sse.js";
import type {
  AIProvider,
  CredentialValidation,
  GenerateRequest,
  ProviderCredentials,
  ProviderModelDescriptor,
  ProviderRuntimeConfig,
  StreamEvent,
} from "../AIProvider.js";
import { getBuiltInProvider } from "../catalog.js";
import { normalizeAIResponse, compactUsage } from "../normalizers/normalize.js";
import { createReasoningFilter, stripReasoning } from "@Ken/shared";
import { buildCompatibleChatBody } from "./groqChatBody.js";

export class OpenAICompatibleProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly type: ProviderType;
  private readonly credentials: ProviderCredentials;

  constructor(config: ProviderRuntimeConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.credentials = config.credentials;
  }

  getCapabilities() {
    return getBuiltInProvider(this.id)?.capabilities ?? ["text", "streaming"];
  }

  async getModels(): Promise<ProviderModelDescriptor[]> {
    return getBuiltInProvider(this.id)?.models ?? [];
  }

  async validateCredentials(credentials?: ProviderCredentials): Promise<CredentialValidation> {
    const apiKey = credentials?.apiKey ?? this.credentials.apiKey;
    const baseUrl = (credentials?.baseUrl ?? this.credentials.baseUrl ?? "").replace(/\/$/, "");
    if (!baseUrl) {
      return { status: "error", message: "Base URL is required" };
    }
    if (!apiKey && this.type !== "ollama") {
      return { status: "error", message: "API key is required" };
    }

    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (response.status === 200) return { status: "connected", message: "Connected" };
      if (response.status === 401 || response.status === 403) {
        return { status: "invalid", message: "Invalid credentials" };
      }
      return { status: "unavailable", message: "Unavailable" };
    } catch {
      return { status: "error", message: "Error contacting provider" };
    }
  }

  async generate(request: GenerateRequest) {
    const apiKey = this.credentials.apiKey;
    if (!apiKey && this.type !== "ollama") {
      throw new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }
    const baseUrl = this.requireBaseUrl();
    try {
      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(buildCompatibleChatBody(request, { stream: false, providerId: this.id })),
      };
      if (request.abortSignal) init.signal = request.abortSignal;
      const response = await fetch(`${baseUrl}/chat/completions`, init);

      if (!response.ok) {
        await throwProviderHttpError(response, this.id);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      // Non-streaming replies carry the same inline `<think>` blocks.
      const stripped = stripReasoning(body.choices?.[0]?.message?.content ?? "");

      return normalizeAIResponse({
        content: stripped.visible,
        model: request.modelId,
        provider: this.id,
        finishReason: body.choices?.[0]?.finish_reason ?? "stop",
        usage: {
          inputTokens: body.usage?.prompt_tokens,
          outputTokens: body.usage?.completion_tokens,
          totalTokens: body.usage?.total_tokens,
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toSafeError(error);
    }
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    yield { type: "start", model: request.modelId, provider: this.id };
    const apiKey = this.credentials.apiKey;
    if (!apiKey && this.type !== "ollama") {
      throw new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }
    const baseUrl = this.requireBaseUrl();
    let content = "";
    let reasoning = "";
    const reasoningFilter = createReasoningFilter();
    let finishReason = "stop";
    let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

    try {
      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify(buildCompatibleChatBody(request, { stream: true, providerId: this.id })),
      };
      if (request.abortSignal) init.signal = request.abortSignal;
      const response = await fetch(`${baseUrl}/chat/completions`, init);
      if (!response.ok) {
        await throwProviderHttpError(response, this.id);
      }

      for await (const payload of iterateSseData(response, request.abortSignal)) {
        if (request.abortSignal?.aborted) break;
        try {
          const body = JSON.parse(payload) as {
            choices?: Array<{
              delta?: { content?: string; reasoning_content?: string; reasoning?: string };
              finish_reason?: string | null;
            }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const delta = body.choices?.[0]?.delta;
          // Reasoning models expose the chain of thought on a side channel. It is
          // counted but never streamed to the user.
          const sideChannel = delta?.reasoning_content ?? delta?.reasoning ?? "";
          if (sideChannel) reasoning += sideChannel;

          const text = delta?.content ?? "";
          if (text) {
            // The same models also inline `<think>` blocks in `content`, and a tag
            // can straddle two frames, so filtering is stateful across chunks.
            const filtered = reasoningFilter.push(text);
            if (filtered.reasoning) reasoning += filtered.reasoning;
            if (filtered.visible) {
              content += filtered.visible;
              yield { type: "chunk", text: filtered.visible };
            }
          }
          if (body.choices?.[0]?.finish_reason) finishReason = body.choices[0].finish_reason;
          if (body.usage) {
            usage = compactUsage({
              inputTokens: body.usage.prompt_tokens,
              outputTokens: body.usage.completion_tokens,
              totalTokens: body.usage.total_tokens,
            });
          }
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

    // Release anything the filter was holding back as a possible partial tag,
    // otherwise a reply ending mid-tag would lose its final characters.
    const tail = reasoningFilter.flush();
    if (tail.reasoning) reasoning += tail.reasoning;
    if (tail.visible) {
      content += tail.visible;
      yield { type: "chunk", text: tail.visible };
    }

    yield {
      type: "complete",
      response: normalizeAIResponse({
        content,
        model: request.modelId,
        provider: this.id,
        finishReason: request.abortSignal?.aborted ? "unknown" : finishReason,
        ...(usage ? { usage } : {}),
        ...(request.abortSignal?.aborted || reasoning
          ? {
              metadata: {
                ...(request.abortSignal?.aborted ? { aborted: true } : {}),
                ...(reasoning ? { reasoningChars: reasoning.length } : {}),
              },
            }
          : {}),
      }),
    };
  }

  private requireBaseUrl(): string {
    const base = this.credentials.baseUrl?.replace(/\/$/, "");
    if (!base) {
      throw new AppError("Provider base URL is not configured", {
        statusCode: 503,
        code: "PROVIDER_NOT_CONFIGURED",
      });
    }
    return base;
  }
}

export function parseProviderHttpError(status: number, bodyText: string, providerId: string): AppError {
  let providerMessage: string | undefined;
  let providerCode: string | undefined;
  try {
    const parsed = JSON.parse(bodyText) as {
      error?: { message?: string; code?: string; type?: string };
    };
    providerMessage = parsed.error?.message;
    providerCode = parsed.error?.code ?? parsed.error?.type;
  } catch {
    if (bodyText.trim()) providerMessage = bodyText.slice(0, 500);
  }

  logger.warn(
    {
      providerId,
      status,
      providerCode,
      providerMessage: providerMessage ? redactSensitive(providerMessage) : undefined,
    },
    "Provider HTTP error",
  );

  if (status === 401 || status === 403) {
    return new AppError("Invalid credentials", { statusCode: 401, code: "PROVIDER_INVALID_CREDENTIALS" });
  }
  if (status === 429) {
    return new AppError("Provider rate limit reached.", { statusCode: 429, code: "PROVIDER_RATE_LIMITED" });
  }
  const retired =
    Boolean(providerMessage) &&
    /decommissioned|does not exist|unknown model|not found|model_decommissioned/i.test(providerMessage ?? "");
  if (retired) {
    return new AppError(providerMessage ?? "Model unavailable", { statusCode: 404, code: "MODEL_UNAVAILABLE" });
  }
  return new AppError(providerMessage || "Provider request failed", { statusCode: 502, code: "PROVIDER_ERROR" });
}

async function throwProviderHttpError(response: Response, providerId: string): Promise<never> {
  const bodyText = await response.text();
  throw parseProviderHttpError(response.status, bodyText, providerId);
}
