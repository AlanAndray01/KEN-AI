import { logger } from "../../config/logger.js";
import { redisClient } from "../../config/redis.js";

export const GENERATION_TIMEOUT_MS = 180_000;

const ABORT_CHANNEL = "ken:generation:abort";

type AbortMessage =
  | { scope: "generation"; generationId: string }
  | { scope: "conversation"; userId: string; conversationId: string }
  | { scope: "user"; userId: string };

/**
 * Aborting a generation only ever works on the process instance that holds
 * its AbortController — a live JS object, never something Redis can store.
 * In a single-instance deployment the local Maps below are the whole story.
 * Once REDIS_URL is set, every abort call also publishes to a channel every
 * instance subscribes to, so a request that happens to land on instance B
 * still reaches the instance actually streaming the reply on instance A.
 */
export class GenerationRegistry {
  private readonly controllers = new Map<string, AbortController>();
  private readonly byConversation = new Map<string, string>();
  private readonly subscriber = redisClient?.duplicate();

  constructor() {
    if (!this.subscriber) return;
    this.subscriber.on("error", (error: Error) => logger.warn({ err: error }, "Redis abort subscriber error"));
    this.subscriber.on("message", (_channel: string, raw: string) => {
      try {
        this.applyRemote(JSON.parse(raw) as AbortMessage);
      } catch {
        // Ignore a malformed cross-instance abort message.
      }
    });
    void this.subscriber
      .subscribe(ABORT_CHANNEL)
      .catch((error: Error) => logger.warn({ err: error }, "Redis abort subscribe failed"));
  }

  private applyRemote(message: AbortMessage): void {
    if (message.scope === "generation") this.abortLocal(message.generationId);
    else if (message.scope === "conversation") this.abortConversationLocal(message.userId, message.conversationId);
    else this.abortUserLocal(message.userId);
  }

  private publish(message: AbortMessage): void {
    if (!redisClient) return;
    void redisClient
      .publish(ABORT_CHANNEL, JSON.stringify(message))
      .catch((error: Error) => logger.warn({ err: error }, "Redis abort publish failed"));
  }

  start(userId: string, conversationId: string, generationId: string): { signal: AbortSignal } {
    this.abortConversation(userId, conversationId);
    const controller = new AbortController();
    this.controllers.set(generationId, controller);
    this.byConversation.set(conversationKey(userId, conversationId), generationId);
    return {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(GENERATION_TIMEOUT_MS)]),
    };
  }

  private abortLocal(generationId: string): boolean {
    const controller = this.controllers.get(generationId);
    if (!controller) return false;
    if (!controller.signal.aborted) {
      controller.abort();
    }
    return true;
  }

  abort(generationId: string): boolean {
    const found = this.abortLocal(generationId);
    this.publish({ scope: "generation", generationId });
    return found;
  }

  private abortConversationLocal(userId: string, conversationId: string): boolean {
    const generationId = this.byConversation.get(conversationKey(userId, conversationId));
    if (!generationId) return false;
    return this.abortLocal(generationId);
  }

  abortConversation(userId: string, conversationId: string): boolean {
    const found = this.abortConversationLocal(userId, conversationId);
    this.publish({ scope: "conversation", userId, conversationId });
    return found;
  }

  private abortUserLocal(userId: string): number {
    const prefix = `${userId}:`;
    let aborted = 0;
    for (const [key, generationId] of this.byConversation.entries()) {
      if (!key.startsWith(prefix)) continue;
      if (this.abortLocal(generationId)) aborted += 1;
      this.byConversation.delete(key);
    }
    return aborted;
  }

  /**
   * Stops every stream still running for one user. Account deletion calls this
   * first so an in-flight generation cannot write a message row back into a
   * collection that is about to be purged.
   */
  abortUser(userId: string): number {
    const count = this.abortUserLocal(userId);
    this.publish({ scope: "user", userId });
    return count;
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
