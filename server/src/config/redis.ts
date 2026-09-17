import { Redis } from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

/**
 * Rate limiting, the generation-abort registry, and the model-skip cache all
 * default to per-process in-memory state, which is correct for a single
 * instance but silently wrong once more than one is running (Render/most
 * hosts scale by adding instances, not by making one instance bigger): each
 * instance enforces its own rate-limit counters, can only abort a generation
 * it is itself streaming, and can only see cooldowns it personally recorded.
 *
 * `redisClient` is `null` whenever REDIS_URL is unset, and every call site
 * that uses it falls back to today's in-memory-only behavior in that case —
 * this is opt-in hardening, not a new requirement to run the app.
 */
export const redisClient: Redis | null = env.REDIS_URL
  ? new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      // A per-call timeout beats the default (retry forever) — a stalled
      // Redis command must not hang a chat request behind it.
      commandTimeout: 2_000,
    })
  : null;

redisClient?.on("error", (error: Error) => {
  logger.warn({ err: error }, "Redis connection error");
});
