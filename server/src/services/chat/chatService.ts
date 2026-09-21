export type { ChatStreamEvent, GenerationRuntime, PreparedGeneration } from "./generationTypes.js";
export { prepareEdit, prepareRegenerate, prepareSend } from "./prepareGeneration.js";
export { runGeneration } from "./runGeneration.js";
export { loadHistory } from "./loadHistory.js";

import { generationRegistry } from "./generationRegistry.js";

export function abortGeneration(userId: string, conversationId: string, generationId?: string): boolean {
  if (generationId) {
    return generationRegistry.abort(generationId);
  }
  return generationRegistry.abortConversation(userId, conversationId);
}
