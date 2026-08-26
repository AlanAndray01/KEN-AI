import { AppError } from "../../utils/AppError.js";
import type { AIProvider, ProviderRuntimeConfig } from "./AIProvider.js";
import { AnthropicProvider } from "./providers/AnthropicProvider.js";
import { isMockAiAllowed, MockProvider } from "./providers/MockProvider.js";
import { OpenAICompatibleProvider } from "./providers/OpenAICompatibleProvider.js";

export function createProviderAdapter(config: ProviderRuntimeConfig): AIProvider {
  if (config.id === "mock") {
    if (!isMockAiAllowed()) {
      return new OpenAICompatibleProvider(config);
    }
    return new MockProvider();
  }

  if (config.type === "gemini") {
    throw new AppError("Gemini is no longer supported. Choose a Groq or OpenAI-compatible model.", {
      statusCode: 410,
      code: "PROVIDER_REMOVED",
    });
  }

  if (config.type === "anthropic") {
    return new AnthropicProvider(config);
  }

  return new OpenAICompatibleProvider(config);
}
