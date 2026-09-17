import { env, isTest } from "../../config/env.js";
import { redisClient } from "../../config/redis.js";
import { AppError } from "../../utils/AppError.js";
import { MemoryRateLimitStore, RedisRateLimitStore } from "../../middleware/rateLimit.js";

const store = redisClient
  ? new RedisRateLimitStore("login-lockout", env.RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS, env.RATE_LIMIT_LOGIN_FAILURES)
  : new MemoryRateLimitStore(env.RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS, env.RATE_LIMIT_LOGIN_FAILURES);

export async function assertLoginNotLocked(ip: string): Promise<void> {
  if (isTest) return;
  const current = await store.peek(ip);
  if (current && current.count >= env.RATE_LIMIT_LOGIN_FAILURES) {
    throw lockedError();
  }
}

export async function recordFailedLogin(ip: string): Promise<void> {
  if (isTest) return;
  const result = await store.consume(ip);
  if (result.allowed) return;
  throw lockedError();
}

export async function recordFailedLoginForTest(ip: string): Promise<void> {
  const current = await store.peek(ip);
  if (current && current.count >= env.RATE_LIMIT_LOGIN_FAILURES) {
    throw lockedError();
  }
  const result = await store.consume(ip);
  if (result.allowed) return;
  throw lockedError();
}

export function resetLoginFailures(): void {
  if (store instanceof MemoryRateLimitStore) store.clear();
}

function lockedError(): AppError {
  return new AppError("Too many failed sign-in attempts. Try again in 15 minutes.", {
    statusCode: 429,
    code: "RATE_LIMITED",
  });
}
