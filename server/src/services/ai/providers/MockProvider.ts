import { env, isProduction } from "../../../config/env.js";
import type { ModelCapability } from "@aether/shared";
import type {
  AIProvider,
  CredentialValidation,
  GenerateRequest,
  ProviderModelDescriptor,
  StreamEvent,
} from "../AIProvider.js";
import { normalizeAIResponse } from "../normalizers/normalize.js";

export class MockProvider implements AIProvider {
  readonly id = "mock";
  readonly name = "Mock AI";
  readonly type = "custom" as const;

  getCapabilities(): ModelCapability[] {
    return ["text", "streaming"];
  }

  async getModels(): Promise<ProviderModelDescriptor[]> {
    return [
      {
        id: "mock-text",
        name: "Mock Text",
        description: "Development-only mock model",
        capabilities: ["text", "streaming"],
        contextWindow: 8192,
      },
    ];
  }

  async validateCredentials(): Promise<CredentialValidation> {
    if (isProduction || !env.ENABLE_MOCK_AI) {
      return { status: "error", message: "Mock AI is disabled" };
    }
    return { status: "connected", message: "Mock AI enabled" };
  }

  async generate(request: GenerateRequest) {
    const last = request.messages.at(-1)?.content ?? "";
    return normalizeAIResponse({
      content: `[mock] ${last || "No AI provider configured."}`,
      model: request.modelId,
      provider: this.id,
      finishReason: "stop",
    });
  }

  async *stream(request: GenerateRequest): AsyncIterable<StreamEvent> {
    yield { type: "start", model: request.modelId, provider: this.id };
    const result = await this.generate(request);
    const parts = result.content.split(/(\s+)/).filter(Boolean);
    let content = "";
    for (const part of parts) {
      if (request.abortSignal?.aborted) break;
      content += part;
      yield { type: "chunk", text: part };
    }
    yield {
      type: "complete",
      response: normalizeAIResponse({
        content,
        model: request.modelId,
        provider: this.id,
        finishReason: request.abortSignal?.aborted ? "unknown" : "stop",
        ...(request.abortSignal?.aborted ? { metadata: { aborted: true } } : {}),
      }),
    };
  }
}

export function isMockAiAllowed(): boolean {
  return env.ENABLE_MOCK_AI && !isProduction;
}
