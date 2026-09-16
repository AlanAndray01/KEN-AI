import type { AIProvider, ProviderRuntimeConfig } from "./AIProvider.js";
import { GeminiProvider } from "./providers/GeminiProvider.js";
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
    return new GeminiProvider(config);
  }


  return new OpenAICompatibleProvider(config);
}
