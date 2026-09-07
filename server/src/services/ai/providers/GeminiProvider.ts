import type { ProviderRuntimeConfig } from "../AIProvider.js";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider.js";

/** Google's official OpenAI-compatible Gemini endpoint (AI Studio / Gemini API). */
export const GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

/**
 * Gemini adapter. Traffic stays on Google's documented OpenAI-compatible
 * surface so streaming and tools reuse the shared client, without putting a
 * key in the browser.
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
}
