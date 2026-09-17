import { env, isTest } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { redisClient } from "../../config/redis.js";
import { AppError } from "../../utils/AppError.js";
import type { CredentialSource } from "./credentials.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * No usage.ts running total existed before this — UsageRecord rows are
 * written per completed generation and only ever aggregated on read
 * (usageController's /me/usage, /admin/usage), never checked before a new
 * request. This keeps a same-day running total per user so a request can be
 * refused before it is dispatched, not just reported on afterward.
 *
 * Same in-memory-with-optional-Redis shape as the rate limiters: correct
 * for one instance on its own, and shared across instances once REDIS_URL
 * is set.
 */
const memoryTotals = new Map<string, { tokens: number; resetAt: number }>();

function todayKey(userId: string): string {
  return `spend:${userId}:${new Date().toISOString().slice(0, 10)}`;
}

async function readTokensUsedToday(key: string): Promise<number> {
  if (redisClient) {
    try {
      const value = await redisClient.get(key);
      return value ? Number(value) : 0;
    } catch (error) {
      logger.warn({ err: error }, "Redis spend read failed; allowing request");
      return 0;
    }
  }
  const current = memoryTotals.get(key);
  if (!current || current.resetAt <= Date.now()) return 0;
  return current.tokens;
}

async function checkCeiling(userId: string, source: CredentialSource): Promise<void> {
  if (source === "user") return;
  const ceiling = env.AUTO_MODE_DAILY_TOKEN_CEILING;
  if (!ceiling) return;

  const used = await readTokensUsedToday(todayKey(userId));
  if (used >= ceiling) {
    throw new AppError(
      "Daily usage limit reached for shared platform keys. Add your own provider key in Settings to keep going today.",
      { statusCode: 429, code: "SPEND_CEILING_REACHED" },
    );
  }
}

/** Platform-key generations only call this before dispatching to a provider. */
export async function assertUnderSpendCeiling(userId: string, source: CredentialSource): Promise<void> {
  if (isTest) return;
  await checkCeiling(userId, source);
}

/** Test-only: exercises the ceiling without skipping NODE_ENV=test. */
export async function assertUnderSpendCeilingForTest(userId: string, source: CredentialSource): Promise<void> {
  await checkCeiling(userId, source);
}

/** Called once a generation completes, so the next check sees today's real total. */
export async function recordSpend(userId: string, source: CredentialSource, totalTokens: number): Promise<void> {
  if (source === "user") return;
  if (!totalTokens || totalTokens <= 0) return;
  const key = todayKey(userId);

  if (redisClient) {
    try {
      await redisClient.incrby(key, totalTokens);
      await redisClient.expire(key, Math.ceil(DAY_MS / 1000), "NX");
      return;
    } catch (error) {
      logger.warn({ err: error }, "Redis spend write failed");
    }
  }

  const now = Date.now();
  const current = memoryTotals.get(key);
  if (!current || current.resetAt <= now) {
    memoryTotals.set(key, { tokens: totalTokens, resetAt: now + DAY_MS });
  } else {
    current.tokens += totalTokens;
  }
}

/** Test-only: clears the in-memory fallback between tests. */
export function resetSpendCeilingForTest(): void {
  memoryTotals.clear();
}
