export function attachmentRoutedMessage(modelName: string): string {
  return `Attachment routed to ${modelName}`;
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
