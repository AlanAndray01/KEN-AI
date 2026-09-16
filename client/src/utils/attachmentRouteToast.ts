export function attachmentRoutedMessage(modelName: string): string {
  return `Attachment routed to ${modelName}`;
}

/**
 * A pinned turn only leaves its model for a provider quota error, so the notice
 * names both sides: the reader has to know the reply is not from the model they
 * chose, and that the choice itself has not changed.
 */
export function quotaFallbackMessage(requestedName: string, activeName: string): string {
  return `${requestedName} has reached its usage limit, so this reply is from ${activeName}.`;
}

export function displayNameForRoutedModel(
  modelId: string,
  models: Array<{ id: string; name?: string }>,
  modelName?: string,
): string {
  if (modelName?.trim()) return modelName.trim();
  const listed = models.find((model) => model.id === modelId)?.name?.trim();
  if (listed) return listed;
  const last = modelId.split("/").pop() ?? modelId;
  return last.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
