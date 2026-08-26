import {
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  resolveGroqModelId,
  type PublicAIModel,
} from "@Ken/shared";

export function pickDefaultModel(models: PublicAIModel[]): PublicAIModel | undefined {
  const available = models.filter((model) => model.available && model.enabled !== false);
  const pick = (providerId: string, id: string) =>
    available.find((model) => model.providerId === providerId && model.id === id);

  return (
    pick("groq", DEFAULT_GROQ_MODEL_ID) ??
    pick("groq", GROQ_QUALITY_MODEL_ID) ??
    pick("openai", DEFAULT_OPENAI_MODEL_ID) ??
    available.find((model) => model.providerId !== "gemini") ??
    available[0] ??
    models[0]
  );
}

export function shouldReplaceStoredModel(
  stored: { providerId: string; modelId: string },
  defaultModel: PublicAIModel,
  models: PublicAIModel[],
): boolean {
  if (!stored.providerId || !stored.modelId) return true;
  if (stored.providerId === "gemini") return true;
  if (stored.providerId === "groq" && resolveGroqModelId(stored.modelId) !== stored.modelId) return true;
  const exists = models.some((model) => model.providerId === stored.providerId && model.id === stored.modelId);
  if (!exists) return true;
  return false;
}
