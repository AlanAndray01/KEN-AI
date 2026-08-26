export const GENERATION_TIMEOUT_MS = 180_000;

export class GenerationRegistry {
  private readonly controllers = new Map<string, AbortController>();
  private readonly byConversation = new Map<string, string>();

  start(userId: string, conversationId: string, generationId: string): { signal: AbortSignal } {
    this.abortConversation(userId, conversationId);
    const controller = new AbortController();
    this.controllers.set(generationId, controller);
    this.byConversation.set(conversationKey(userId, conversationId), generationId);
    return {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]),
    };
  }

  abort(generationId: string): boolean {
    const controller = this.controllers.get(generationId);
    if (!controller) return false;
    if (!controller.signal.aborted) {
      controller.abort();
    }
    return true;
  }

  abortConversation(userId: string, conversationId: string): boolean {
    const generationId = this.byConversation.get(conversationKey(userId, conversationId));
    if (!generationId) return false;
    return this.abort(generationId);
  }

  /**
   * Stops every stream still running for one user. Account deletion calls this
   * first so an in-flight generation cannot write a message row back into a
   * collection that is about to be purged.
   */
  abortUser(userId: string): number {
    const prefix = `${userId}:`;
    let aborted = 0;
    for (const [key, generationId] of this.byConversation.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (this.abort(generationId)) aborted += 1;
      this.byConversation.delete(key);
    }
    return aborted;
  }

  finish(generationId: string, userId?: string, conversationId?: string): void {
    this.controllers.delete(generationId);
    if (userId && conversationId) {
      const key = conversationKey(userId, conversationId);
      if (this.byConversation.get(key) === generationId) {
        this.byConversation.delete(key);
      }
    } else {
      for (const [key, value] of this.byConversation.entries()) {
        if (value === generationId) this.byConversation.delete(key);
      }
    }
  }

  get(generationId: string): AbortController | undefined {
    return this.controllers.get(generationId);
  }
}

function conversationKey(userId: string, conversationId: string): string {
  return `${userId}:${conversationId}`;
}

export const generationRegistry = new GenerationRegistry();
