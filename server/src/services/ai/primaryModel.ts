import {
  DEFAULT_CEREBRAS_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_DEEPSEEK_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GEMINI_FLASH_2_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GROQ_OSS_20B_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
} from "@Ken/shared";

export const GROQ_PRIMARY_MODEL_IDS = [DEFAULT_GROQ_MODEL_ID, GROQ_OSS_20B_MODEL_ID, GROQ_QUALITY_MODEL_ID] as const;
export const OPENAI_FALLBACK_MODEL_IDS = [DEFAULT_OPENAI_MODEL_ID, "gpt-4.1"] as const;

export const GEMINI_PRIMARY_MODEL_IDS = [
  DEFAULT_GEMINI_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_FLASH_2_MODEL_ID,
] as const;

export const FREE_FALLBACK_CHAIN = [
  { providerId: "gemini", modelId: DEFAULT_GEMINI_MODEL_ID },
  { providerId: "gemini", modelId: GEMINI_FLASH_MODEL_ID },
  { providerId: "gemini", modelId: GEMINI_FLASH_2_MODEL_ID },
  { providerId: "groq", modelId: DEFAULT_GROQ_MODEL_ID },
  { providerId: "groq", modelId: GROQ_QUALITY_MODEL_ID },
  { providerId: "deepseek", modelId: DEFAULT_DEEPSEEK_MODEL_ID },
  { providerId: "cerebras", modelId: DEFAULT_CEREBRAS_MODEL_ID },
  { providerId: "cloudflare", modelId: DEFAULT_CLOUDFLARE_MODEL_ID },
] as const;

export function pickConfiguredModel(
  models: Array<{ id: string; providerId: string }>,
  providerId: string,
  preferredIds: readonly string[],
  configuredModelId?: string,
): { id: string; providerId: string } | undefined {
  if (configuredModelId) {
    const exact = models.find((model) => model.providerId === providerId && model.id === configuredModelId);
    if (exact) return exact;
  }
  for (const modelId of preferredIds) {
    const match = models.find((model) => model.providerId === providerId && model.id === modelId);
    if (match) return match;
  }
  return models.find((model) => model.providerId === providerId);
}

export function preferredIdsForProvider(providerId: string): readonly string[] {
  if (providerId === "gemini") return GEMINI_PRIMARY_MODEL_IDS;
  if (providerId === "groq") return GROQ_PRIMARY_MODEL_IDS;
  if (providerId === "openai") return OPENAI_FALLBACK_MODEL_IDS;
  if (providerId === "cerebras") return [DEFAULT_CEREBRAS_MODEL_ID];
  if (providerId === "deepseek") return [DEFAULT_DEEPSEEK_MODEL_ID];
  if (providerId === "cloudflare") return [DEFAULT_CLOUDFLARE_MODEL_ID];
  return [];
}
