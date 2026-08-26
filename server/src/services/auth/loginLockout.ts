import { env, isTest } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { MemoryRateLimitStore } from "../../middleware/rateLimit.js";

const store = new MemoryRateLimitStore(env.RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS, env.RATE_LIMIT_LOGIN_FAILURES);

export function assertLoginNotLocked(ip: string): void {
  if (isTest) return;
  const current = store.get(ip);
  if (current && current.count >= env.RATE_LIMIT_LOGIN_FAILURES) {
    throw lockedError();
  }
}

export function recordFailedLogin(ip: string): void {
  if (isTest) return;
  const result = store.consume(ip);
  if (result.allowed) return;
  throw lockedError();
}

export function recordFailedLoginForTest(ip: string): void {
  const current = store.get(ip);
  if (current && current.count >= env.RATE_LIMIT_LOGIN_FAILURES) {
    throw lockedError();
  }
  const result = store.consume(ip);
  if (result.allowed) return;
  throw lockedError();
}

export function resetLoginFailures(): void {
  store.clear();
}

function lockedError(): AppError {
  return new AppError("Too many failed sign-in attempts. Try again in 15 minutes.", {
    statusCode: 429,
    code: "RATE_LIMITED",
  });
}
