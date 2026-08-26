import { env, isTest } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { MemoryRateLimitStore } from "../../middleware/rateLimit.js";
import type { CredentialSource } from "./credentials.js";

const store = new MemoryRateLimitStore(env.RATE_LIMIT_WINDOW_MS, env.RATE_LIMIT_CHAT_PLATFORM);

/**
 * Extra quota for generations that use a shared platform key (env or admin-stored).
 * Bring-your-own keys skip this limiter and only hit the route-level chat limit.
 */
export function consumePlatformChatQuota(userId: string, source: CredentialSource): void {
  if (source === "user") return;
  if (isTest) return;

  const result = store.consume(userId);
  if (result.allowed) return;

  throw new AppError(
    "Shared platform keys are rate-limited. Add your own provider key in Settings to raise this limit.",
    { statusCode: 429, code: "RATE_LIMITED" },
  );
}

/** Test-only: exercise the limiter without skipping NODE_ENV=test. */
export function consumePlatformChatQuotaForTest(userId: string): void {
  const result = store.consume(userId);
  if (result.allowed) return;
  throw new AppError(
    "Shared platform keys are rate-limited. Add your own provider key in Settings to raise this limit.",
    { statusCode: 429, code: "RATE_LIMITED" },
  );
}

export function resetPlatformChatQuota(): void {
  store.clear();
}
