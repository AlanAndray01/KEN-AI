import { GROQ_MODEL_ALIASES, type PublicAIModel } from "@aether/shared";
import { AppError } from "../../utils/AppError.js";
import { AIModel } from "../../models/AIModel.js";
import { BUILT_IN_PROVIDERS, getBuiltInProvider } from "./catalog.js";
import { describeConfiguredSecret, loadGlobalProviders } from "./credentials.js";
import { isMockAiAllowed } from "./providers/MockProvider.js";
import type { ProviderModelDescriptor } from "./AIProvider.js";

interface ModelRecord {
  modelId: string;
  providerId: string;
  name: string;
  description?: string;
  capabilities: ProviderModelDescriptor["capabilities"];
  contextWindow?: number;
  enabled: boolean;
}

export class ModelRegistry {
  async listPublicModels(userId?: string): Promise<PublicAIModel[]> {
    const models = await this.listAllModels(userId);
    return models.filter((model) => model.enabled && model.available);
  }

  async listAllModels(userId?: string): Promise<PublicAIModel[]> {
    const providers = await this.providerAvailability(userId);
    const stored = await this.loadStoredModels();
    const merged = new Map<string, PublicAIModel>();

    for (const builtIn of BUILT_IN_PROVIDERS) {
      const availability = providers.get(builtIn.providerId) ?? { enabled: false, configured: false };
      for (const model of builtIn.models) {
        merged.set(
          key(builtIn.providerId, model.id),
          toPublicModel({
            modelId: model.id,
            providerId: builtIn.providerId,
            name: model.name,
            ...(model.description ? { description: model.description } : {}),
            capabilities: model.capabilities,
            ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
            enabled: true,
          }, availability),
        );
      }
    }

    if (isMockAiAllowed()) {
      merged.set(
        key("mock", "mock-text"),
        toPublicModel(
          {
            modelId: "mock-text",
            providerId: "mock",
            name: "Mock Text",
            description: "Development-only mock model",
            capabilities: ["text", "streaming"],
            contextWindow: 8192,
            enabled: true,
          },
          { enabled: true, configured: true },
        ),
      );
    }

    for (const model of stored) {
      if (isRetiredGroqModel(model.providerId, model.modelId)) continue;
      const availability = providers.get(model.providerId) ?? { enabled: false, configured: false };
      merged.set(key(model.providerId, model.modelId), toPublicModel(model, availability));
    }

    return [...merged.values()].sort((a, b) => {
      const byRank = providerRank(a.providerId) - providerRank(b.providerId);
      if (byRank !== 0) return byRank;
      return catalogIndex(a.providerId, a.id) - catalogIndex(b.providerId, b.id);
    });
  }

  async assertModelAvailable(providerId: string, modelId: string, userId?: string): Promise<PublicAIModel> {
    const models = await this.listAllModels(userId);
    const match = models.find((model) => model.providerId === providerId && model.id === modelId);
    if (!match || !match.enabled || !match.available) {
      throw new AppError("Model unavailable", { statusCode: 404, code: "MODEL_UNAVAILABLE" });
    }
    return match;
  }

  private async providerAvailability(
    userId?: string,
  ): Promise<Map<string, { enabled: boolean; configured: boolean }>> {
    const map = new Map<string, { enabled: boolean; configured: boolean }>();
    const stored = await loadGlobalProviders();
    const ids = new Set<string>([
      ...BUILT_IN_PROVIDERS.map((item) => item.providerId),
      ...stored.map((item) => item.providerId),
    ]);
    if (isMockAiAllowed()) ids.add("mock");

    for (const providerId of ids) {
      const record = stored.find((item) => item.providerId === providerId);
      const enabled = record?.enabled ?? Boolean(getBuiltInProvider(providerId) || providerId === "mock");
      const secret = await describeConfiguredSecret(providerId, userId);
      map.set(providerId, {
        enabled,
        configured: enabled && secret.configured,
      });
    }

    return map;
  }

  private async loadStoredModels(): Promise<ModelRecord[]> {
    const docs = await AIModel.find({});
    return docs.map((doc) => ({
      modelId: doc.modelId,
      providerId: doc.providerId,
      name: doc.name,
      ...(doc.description ? { description: doc.description } : {}),
      capabilities: (doc.capabilities ?? []) as ProviderModelDescriptor["capabilities"],
      ...(doc.contextWindow ? { contextWindow: doc.contextWindow } : {}),
      enabled: doc.enabled,
    }));
  }
}

function isRetiredGroqModel(providerId: string, modelId: string): boolean {
  return providerId === "groq" && modelId in GROQ_MODEL_ALIASES;
}

function key(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function catalogIndex(providerId: string, modelId: string): number {
  const index = getBuiltInProvider(providerId)?.models.findIndex((model) => model.id === modelId) ?? -1;
  return index === -1 ? 10_000 : index;
}

function providerRank(providerId: string): number {
  if (providerId === "groq") return 0;
  if (providerId === "cerebras") return 1;
  if (providerId === "deepseek") return 2;
  if (providerId === "cloudflare") return 3;
  if (providerId === "openai") return 4;
  return 5;
}

function toPublicModel(
  model: ModelRecord,
  availability: { enabled: boolean; configured: boolean },
): PublicAIModel {
  return {
    id: model.modelId,
    providerId: model.providerId,
    name: model.name,
    ...(model.description ? { description: model.description } : {}),
    capabilities: model.capabilities,
    ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
    enabled: model.enabled,
    available: model.enabled && availability.enabled && availability.configured,
  };
}

export const modelRegistry = new ModelRegistry();
