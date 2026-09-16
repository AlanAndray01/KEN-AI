import { AUTO_MODEL_ID, type ModelCapability, type PublicAIModel, type PublicMessage } from "@Ken/shared";

/**
 * What the composer may offer while Auto is selected.
 *
 * In Auto the server picks a model per turn, and it routes an image or a PDF to
 * a model that can read it. So the composer should accept anything at least one
 * available model can handle, rather than the narrower set of whichever model
 * happens to be the default.
 */
export function availableCapabilities(
  models: ReadonlyArray<Pick<PublicAIModel, "capabilities" | "available" | "enabled">>,
): ModelCapability[] {
  const capabilities = new Set<ModelCapability>();
  for (const model of models) {
    if (!model.available || model.enabled === false) continue;
    for (const capability of model.capabilities) capabilities.add(capability);
  }
  return [...capabilities];
}

/**
 * Footer text naming the model that answered.
 *
 * An Auto turn reads "Auto · <model>" so the reader can see both that Auto chose
 * and what it chose. Before the server has named a model, the optimistic reply
 * still carries the sentinel, which is shown as plain "Auto".
 */
export function modelFooterCaption(
  message: Pick<PublicMessage, "model" | "autoTask">,
  models: ReadonlyArray<Pick<PublicAIModel, "id" | "name">>,
): string | undefined {
  if (!message.model) return undefined;
  if (message.model === AUTO_MODEL_ID) return "Auto";
  const name = models.find((model) => model.id === message.model)?.name ?? message.model;
  return message.autoTask ? `Auto · ${name}` : name;
}

/** Spread onto ChatTurn: omitted entirely when there is no caption to show. */
export function captionProps(
  message: Pick<PublicMessage, "model" | "autoTask">,
  models: ReadonlyArray<Pick<PublicAIModel, "id" | "name">>,
): { modelCaption?: string } {
  const caption = modelFooterCaption(message, models);
  return caption ? { modelCaption: caption } : {};
}
