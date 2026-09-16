import {
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GEMINI_FLASH_2_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
  GROQ_OSS_20B_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  isAutoSelection,
  isLlamaModelId,
  resolveGeminiModelId,
  resolveGroqModelId,
  type PublicAIModel,
} from "@Ken/shared";

export function pickDefaultModel(models: PublicAIModel[]): PublicAIModel | undefined {
  const available = models.filter((model) => model.available && model.enabled !== false);
  const pick = (providerId: string, id: string) =>
    available.find((model) => model.providerId === providerId && model.id === id);

  return (
    pick("gemini", DEFAULT_GEMINI_MODEL_ID) ??
    pick("gemini", GEMINI_FLASH_MODEL_ID) ??
    pick("gemini", GEMINI_FLASH_2_MODEL_ID) ??
    pick("gemini", GEMINI_PRO_MODEL_ID) ??
    available.find((model) => model.providerId === "gemini") ??
    pick("groq", DEFAULT_GROQ_MODEL_ID) ??
    pick("groq", GROQ_OSS_20B_MODEL_ID) ??
    pick("groq", GROQ_QUALITY_MODEL_ID) ??
    pick("openai", DEFAULT_OPENAI_MODEL_ID) ??
    available.find((model) => !isLlamaModelId(model.id)) ??
    available[0] ??
    models[0]
  );
}

export function shouldReplaceStoredModel(
  stored: { providerId: string; modelId: string },
  _defaultModel: PublicAIModel,
  models: PublicAIModel[],
): boolean {
  // Auto is a selection in its own right, not a gap waiting to be filled.
  if (isAutoSelection(stored.providerId, stored.modelId)) return false;
  if (!stored.providerId || !stored.modelId) return true;
  if (stored.providerId === "groq" && resolveGroqModelId(stored.modelId) !== stored.modelId) return true;
  if (stored.providerId === "gemini" && resolveGeminiModelId(stored.modelId) !== stored.modelId) return true;
  if (isLlamaModelId(stored.modelId)) return true;
  const exists = models.some((model) => model.providerId === stored.providerId && model.id === stored.modelId);
  if (!exists) return true;
  return false;
}
