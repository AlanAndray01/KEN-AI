import type { ProviderType } from "@aether/shared";
import { AppError } from "../../../utils/AppError.js";
import { isAbortError } from "../../../utils/abort.js";
import { toSafeError } from "../../../utils/redact.js";
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
import { normalizeAIResponse, compactUsage, toOpenAIMessages } from "../normalizers/normalize.js";

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
        body: JSON.stringify({
          model: request.modelId,
          messages: toOpenAIMessages(request.messages),
        }),
      };
      if (request.abortSignal) init.signal = request.abortSignal;
      const response = await fetch(`${baseUrl}/chat/completions`, init);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AppError("Invalid credentials", { statusCode: 401, code: "PROVIDER_INVALID_CREDENTIALS" });
        }
        throw new AppError("Provider request failed", { statusCode: 502, code: "PROVIDER_ERROR" });
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      };

      return normalizeAIResponse({
        content: body.choices?.[0]?.message?.content ?? "",
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
    let finishReason = "stop";
    let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

    try {
      const init: RequestInit = {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: request.modelId,
          stream: true,
          messages: toOpenAIMessages(request.messages),
        }),
      };
      if (request.abortSignal) init.signal = request.abortSignal;
      const response = await fetch(`${baseUrl}/chat/completions`, init);
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AppError("Invalid credentials", { statusCode: 401, code: "PROVIDER_INVALID_CREDENTIALS" });
        }
        throw new AppError("Provider request failed", { statusCode: 502, code: "PROVIDER_ERROR" });
      }

      for await (const payload of iterateSseData(response, request.abortSignal)) {
        if (request.abortSignal?.aborted) break;
        try {
          const body = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
          };
          const text = body.choices?.[0]?.delta?.content ?? "";
          if (text) {
            content += text;
            yield { type: "chunk", text };
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

    yield {
      type: "complete",
      response: normalizeAIResponse({
        content,
        model: request.modelId,
        provider: this.id,
        finishReason: request.abortSignal?.aborted ? "unknown" : finishReason,
        ...(usage ? { usage } : {}),
        ...(request.abortSignal?.aborted ? { metadata: { aborted: true } } : {}),
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
