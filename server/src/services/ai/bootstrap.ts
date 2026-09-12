import { GEMINI_MODEL_ALIASES, GROQ_MODEL_ALIASES } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AIModel } from "../../models/AIModel.js";
import { AIProvider } from "../../models/AIProvider.js";
import { toSafeError } from "../../utils/redact.js";
import { BUILT_IN_PROVIDERS } from "./catalog.js";

export async function bootstrapProviders(): Promise<void> {
  try {
    const retiredGroqIds = Object.keys(GROQ_MODEL_ALIASES);
    if (retiredGroqIds.length > 0) {
      await AIModel.updateMany(
        { providerId: "groq", modelId: { $in: retiredGroqIds } },
        { $set: { enabled: false } },
      );
    }
    const retiredGeminiIds = Object.keys(GEMINI_MODEL_ALIASES);
    if (retiredGeminiIds.length > 0) {
      await AIModel.updateMany(
        { providerId: "gemini", modelId: { $in: retiredGeminiIds } },
        { $set: { enabled: false } },
      );
    }

    for (const definition of BUILT_IN_PROVIDERS) {
      const existing = await AIProvider.findOne({ providerId: definition.providerId });
      if (!existing) {
        await AIProvider.create({
          providerId: definition.providerId,
          name: definition.name,
          type: definition.type,
          ...(definition.defaultBaseUrl ? { baseUrl: definition.defaultBaseUrl } : {}),
          enabled: true,
          capabilities: definition.capabilities,
        });
      } else if (definition.providerId === "gemini") {
        await existing.updateOne({ $set: { capabilities: definition.capabilities } });
      }

      for (const model of definition.models) {
        const stored = await AIModel.findOne({ providerId: definition.providerId, modelId: model.id });
        if (!stored) {
          await AIModel.create({
            modelId: model.id,
            providerId: definition.providerId,
            name: model.name,
            ...(model.description ? { description: model.description } : {}),
            capabilities: model.capabilities,
            ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
            enabled: true,
          });
          continue;
        }
        if (definition.providerId === "gemini") {
          await stored.updateOne({
            $set: {
              name: model.name,
              ...(model.description ? { description: model.description } : {}),
              capabilities: model.capabilities,
              ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
              enabled: true,
            },
          });
        }
      }
    }
  } catch (error) {
    logger.error({ err: toSafeError(error) }, "Failed to bootstrap AI providers");
    throw toSafeError(error);
  }
}
