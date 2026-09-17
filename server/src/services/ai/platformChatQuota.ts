import { env, isTest } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { redisClient } from "../../config/redis.js";
import { MemoryRateLimitStore, RedisRateLimitStore } from "../../middleware/rateLimit.js";
import type { CredentialSource } from "./credentials.js";

const store = redisClient
  ? new RedisRateLimitStore("chat-platform", env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_CHAT_PLATFORM)
  : new MemoryRateLimitStore(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_CHAT_PLATFORM);

const RATE_LIMIT_MESSAGE =
  "Shared platform keys are rate-limited. Add your own provider key in Settings to raise this limit.";

/**
 * Extra quota for generations that use a shared platform key (env or admin-stored).
 * Bring-your-own keys skip this limiter and only hit the route-level chat limit.
 */
export async function consumePlatformChatQuota(userId: string, source: CredentialSource): Promise<void> {
  if (source === "user") return;
  if (isTest) return;

  const result = await store.consume(userId);
  if (result.allowed) return;

  throw new AppError(RATE_LIMIT_MESSAGE, { statusCode: 429, code: "RATE_LIMITED" });
}

/** Test-only: exercise the limiter without skipping NODE_ENV=test. */
export async function consumePlatformChatQuotaForTest(userId: string): Promise<void> {
  const result = await store.consume(userId);
  if (result.allowed) return;
  throw new AppError(RATE_LIMIT_MESSAGE, { statusCode: 429, code: "RATE_LIMITED" });
}

export function resetPlatformChatQuota(): void {
  if (store instanceof MemoryRateLimitStore) store.clear();
}
