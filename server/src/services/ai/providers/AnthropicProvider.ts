import { AppError } from "../../../utils/AppError.js";
import { toSafeError } from "../../../utils/redact.js";
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
import { normalizeAIResponse, toAnthropicMessages } from "../normalizers/normalize.js";

const DEFAULT_BASE = "https://api.anthropic.com";
const ANTHROPIC_VERSION = "2023-06-01";

export class AnthropicProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "anthropic" as const;
  private readonly credentials: ProviderCredentials;

  constructor(config: ProviderRuntimeConfig) {
    this.id = config.id;
    this.name = config.name;
    this.credentials = config.credentials;
  }

  getCapabilities() {
    return getBuiltInProvider("anthropic")?.capabilities ?? ["text", "streaming", "tools"];
  }

  async getModels(): Promise<ProviderModelDescriptor[]> {
    return getBuiltInProvider("anthropic")?.models ?? [];
  }

  async validateCredentials(credentials?: ProviderCredentials): Promise<CredentialValidation> {
    const apiKey = credentials?.apiKey ?? this.credentials.apiKey;
    if (!apiKey) {
      return { status: "error", message: "API key is missing" };
    }

    try {
      const response = await this.request("/v1/models", {
        apiKey,
        ...(credentials?.baseUrl ? { baseUrl: credentials.baseUrl } : {}),
      });
      if (response.status === 200) return { status: "connected", message: "Connected" };
      if (response.status === 401 || response.status === 403) {
        return { status: "invalid", message: "Invalid credentials" };
      }
      return { status: "unavailable", message: "Unavailable" };
    } catch {
      return { status: "error", message: "Error contacting Anthropic" };
    }
  }

  async generate(request: GenerateRequest) {
    const apiKey = this.requireKey();
    const mapped = toAnthropicMessages(request.messages);
    const system = mapped.system;
    const messages = mapped.messages;

    try {
      const response = await this.request("/v1/messages", {
        method: "POST",
        apiKey,
        ...(request.abortSignal ? { signal: request.abortSignal } : {}),
        body: {
          model: request.modelId,
          max_tokens: request.maxTokens ?? 4096,
          messages,
          ...(system ? { system } : {}),
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new AppError("Invalid credentials", { statusCode: 401, code: "PROVIDER_INVALID_CREDENTIALS" });
        }
        throw new AppError("Provider request failed", { statusCode: 502, code: "PROVIDER_ERROR" });
      }

      const body = (await response.json()) as {
        content?: Array<{ text?: string }>;
        stop_reason?: string;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      return normalizeAIResponse({
        content: body.content?.map((part) => part.text ?? "").join("") ?? "",
        model: request.modelId,
        provider: this.id,
        finishReason: body.stop_reason ?? "stop",
        usage: {
          inputTokens: body.usage?.input_tokens,
          outputTokens: body.usage?.output_tokens,
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw toSafeError(error);
    }
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    yield { type: "start", model: request.modelId, provider: this.id };
    const result = await this.generate(request);
    if (result.content) yield { type: "chunk", text: result.content };
    yield { type: "complete", response: result };
  }

  private requireKey(): string {
    if (!this.credentials.apiKey) {
      throw new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }
    return this.credentials.apiKey;
  }

  private async request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      apiKey?: string;
      baseUrl?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<Response> {
    const apiKey = options.apiKey ?? this.credentials.apiKey;
    if (!apiKey) {
      throw new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }

    const base = (options.baseUrl ?? this.credentials.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
    };
    if (options.signal) init.signal = options.signal;
    if (options.body) init.body = JSON.stringify(options.body);
    return fetch(`${base}${path}`, init);
  }
}
