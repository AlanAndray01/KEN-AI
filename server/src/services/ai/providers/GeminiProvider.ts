import { AppError } from "../../../utils/AppError.js";
import type { GenerateRequest, ProviderRuntimeConfig } from "../AIProvider.js";
import { gatewayGeminiNativeBaseUrl } from "../aiGateway.js";
import {
  generateNativeGemini,
  requestHasInlineMedia,
  streamNativeGemini,
  type NativeGeminiAuth,
} from "./geminiNative.js";
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
    return generateNativeGemini(request, this.nativeAuth());
  }

  override async *stream(request: GenerateRequest) {
    if (!requestHasInlineMedia(request.messages)) {
      yield* super.stream(request);
      return;
    }
    yield* streamNativeGemini(request, this.nativeAuth());
  }

  /**
   * The native surface is a different host and path from the compat one, so it
   * needs its own gateway address rather than the `baseUrl` this adapter was
   * constructed with. Without it, attachment turns silently left the gateway.
   */
  private nativeAuth(): NativeGeminiAuth {
    const apiKey = this.credentials.apiKey;
    if (!apiKey) {
      throw new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }
    const baseUrl = gatewayGeminiNativeBaseUrl();
    return {
      apiKey,
      ...(baseUrl ? { baseUrl } : {}),
      ...(baseUrl && this.credentials.gatewayToken ? { gatewayToken: this.credentials.gatewayToken } : {}),
    };
  }
}
