import type { GptCategory, GptVisibility, ModelCapability } from "@aether/shared";

export interface GptFormValue {
  name: string;
  description: string;
  instructions: string;
  conversationStarters: string;
  visibility: GptVisibility;
  category: GptCategory;
  modelId: string;
  providerId: string;
  capabilities: ModelCapability[];
  knowledgeFileIds: string[];
}

export const emptyGptForm: GptFormValue = {
  name: "",
  description: "",
  instructions: "",
  conversationStarters: "",
  visibility: "private",
  category: "other",
  modelId: "",
  providerId: "",
  capabilities: [],
  knowledgeFileIds: [],
};

export function gptFormToPayload(value: GptFormValue) {
  const starters = value.conversationStarters
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4);
  return {
    name: value.name.trim(),
    ...(value.description.trim() ? { description: value.description.trim() } : {}),
    instructions: value.instructions,
    ...(starters.length > 0 ? { conversationStarters: starters } : {}),
    visibility: value.visibility,
    category: value.category,
    ...(value.modelId.trim() ? { modelId: value.modelId.trim() } : {}),
    ...(value.providerId.trim() ? { providerId: value.providerId.trim() } : {}),
    ...(value.capabilities.length > 0 ? { capabilities: value.capabilities } : {}),
    ...(value.knowledgeFileIds.length > 0 ? { knowledgeFileIds: value.knowledgeFileIds } : {}),
  };
}
