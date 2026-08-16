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
import { normalizeAIResponse, toProviderContents, compactUsage } from "../normalizers/normalize.js";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiProvider implements AIProvider {
  readonly id: string;
  readonly name: string;
  readonly type = "gemini" as const;
  private readonly credentials: ProviderCredentials;

  constructor(config: ProviderRuntimeConfig) {
    this.id = config.id;
    this.name = config.name;
    this.credentials = config.credentials;
  }

  getCapabilities() {
    return getBuiltInProvider("gemini")?.capabilities ?? ["text", "streaming"];
  }

  async getModels(): Promise<ProviderModelDescriptor[]> {
    return getBuiltInProvider("gemini")?.models ?? [];
  }

  async validateCredentials(credentials?: ProviderCredentials): Promise<CredentialValidation> {
    const apiKey = credentials?.apiKey ?? this.credentials.apiKey;
    if (!apiKey) {
      return { status: "error", message: "API key is missing" };
    }

    try {
      const baseUrl = credentials?.baseUrl ?? this.credentials.baseUrl;
      const response = await this.request("/models", {
        apiKey,
        ...(baseUrl ? { baseUrl } : {}),
      });
      if (response.status === 200) {
        return { status: "connected", message: "Connected" };
      }
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return { status: "invalid", message: "Invalid credentials" };
      }
      return { status: "unavailable", message: "Unavailable" };
    } catch {
      return { status: "error", message: "Error contacting Gemini" };
    }
  }

  async generate(request: GenerateRequest) {
    const apiKey = this.requireKey();
    const { system, contents } = toProviderContents(request.messages);
    const response = await this.request(`/models/${encodeURIComponent(request.modelId)}:generateContent`, {
      method: "POST",
      apiKey,
      ...(request.abortSignal ? { signal: request.abortSignal } : {}),
      body: {
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      },
    });

    if (!response.ok) {
      throw this.httpError(response.status);
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    const text =
      body.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";

    return normalizeAIResponse({
      content: text,
      model: request.modelId,
      provider: this.id,
      finishReason: body.candidates?.[0]?.finishReason ?? "stop",
      usage: {
        inputTokens: body.usageMetadata?.promptTokenCount,
        outputTokens: body.usageMetadata?.candidatesTokenCount,
        totalTokens: body.usageMetadata?.totalTokenCount,
      },
    });
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    yield { type: "start", model: request.modelId, provider: this.id };
    const apiKey = this.requireKey();
    const { system, contents } = toProviderContents(request.messages);
    let content = "";
    let finishReason = "stop";
    let usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;

    try {
      const response = await this.request(
        `/models/${encodeURIComponent(request.modelId)}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          apiKey,
          ...(request.abortSignal ? { signal: request.abortSignal } : {}),
          body: {
            contents,
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
          },
        },
      );
      if (!response.ok) {
        throw this.httpError(response.status);
      }

      for await (const payload of iterateSseData(response, request.abortSignal)) {
        if (request.abortSignal?.aborted) break;
        const parsed = parseGeminiStreamPayload(payload);
        if (parsed.text) {
          content += parsed.text;
          yield { type: "chunk", text: parsed.text };
        }
        if (parsed.finishReason) finishReason = parsed.finishReason;
        if (parsed.usage) usage = parsed.usage;
      }
    } catch (error) {
      if (!isAbortError(error) && !request.abortSignal?.aborted) {
        throw error instanceof AppError ? error : toSafeError(error);
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
    try {
      const init: RequestInit = {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
      };
      if (options.signal) init.signal = options.signal;
      if (options.body) init.body = JSON.stringify(options.body);
      return await fetch(`${base}${path}`, init);
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw toSafeError(error);
    }
  }

  private httpError(status: number): AppError {
    if (status === 401 || status === 403) {
      return new AppError("Invalid credentials", { statusCode: 401, code: "PROVIDER_INVALID_CREDENTIALS" });
    }
    if (status === 404) {
      return new AppError("Model unavailable", { statusCode: 404, code: "MODEL_UNAVAILABLE" });
    }
    return new AppError("Gemini request failed", { statusCode: 502, code: "PROVIDER_ERROR" });
  }
}

function parseGeminiStreamPayload(payload: string): {
  text: string;
  finishReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
} {
  try {
    const body = JSON.parse(payload) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    const text =
      body.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? "")
        .join("") ?? "";
    const usage = compactUsage({
      inputTokens: body.usageMetadata?.promptTokenCount,
      outputTokens: body.usageMetadata?.candidatesTokenCount,
      totalTokens: body.usageMetadata?.totalTokenCount,
    });
    return {
      text,
      ...(body.candidates?.[0]?.finishReason ? { finishReason: body.candidates[0].finishReason } : {}),
      ...(usage ? { usage } : {}),
    };
  } catch {
    return { text: "" };
  }
}
