import { AppError } from "../../../utils/AppError.js";
import type { GenerateRequest, ProviderRuntimeConfig } from "../AIProvider.js";
import { generateNativeGemini, requestHasInlineMedia, streamNativeGemini } from "./geminiNative.js";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider.js";

/** Google's official OpenAI-compatible Gemini endpoint (AI Studio / Gemini API). */
export const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/**
 * Gemini adapter. Text-only turns stay on Google's OpenAI-compatible surface.
 * Image and PDF turns use native generateContent so attachments are sent as
 * `inlineData` parts instead of being dropped by the compat normalizer.
 */
export class GeminiProvider extends OpenAICompatibleProvider {
  constructor(config: ProviderRuntimeConfig) {
    super({
      ...config,
      type: "gemini",
      credentials: {
        ...config.credentials,
        baseUrl: config.credentials.baseUrl || GEMINI_OPENAI_BASE_URL,
      },
    });
  }

  override async generate(request: GenerateRequest) {
    if (!requestHasInlineMedia(request.messages)) {
      return super.generate(request);
    }
    return generateNativeGemini(request, this.requireGeminiKey());
  }

  override async *stream(request: GenerateRequest) {
    if (!requestHasInlineMedia(request.messages)) {
      yield* super.stream(request);
      return;
    }
    yield* streamNativeGemini(request, this.requireGeminiKey());
  }

  private requireGeminiKey(): string {
    const apiKey = this.credentials.apiKey;
    if (!apiKey) {
      throw new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }
    return apiKey;
  }
}
