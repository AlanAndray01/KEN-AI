import type { AIProvider, ProviderRuntimeConfig } from "./AIProvider.js";
import { CloudflareProvider } from "./providers/CloudflareProvider.js";
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

  // Matched on id, not type: Cloudflare is registered as openai-compatible and
  // only diverges in how its model list is addressed.
  if (config.id === "cloudflare") {
    return new CloudflareProvider(config);
  }

  return new OpenAICompatibleProvider(config);
}
