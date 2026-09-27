import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "../../config/logger.js";
import { redisClient } from "../../config/redis.js";
import { AppError } from "../../utils/AppError.js";
import { extraString, telemetry } from "../../utils/telemetry.js";
import { isAbortError } from "../../utils/abort.js";
import { isProviderLeaveError } from "./fallback.js";
import { GEMINI_PRIMARY_MODEL_IDS } from "./primaryModel.js";

const SKIP_FILE = join(tmpdir(), "ken-model-skips.json");
let loadedFromDisk = false;

/** Wildcard model id stored when the whole provider must be skipped (vendor 401). */
const PROVIDER_SKIP_MODEL_ID = "*";

const DEFAULT_RATE_LIMIT_SKIP_MS = 30_000;
/** Long enough that a 7s Lite turn cannot expire the skip before the next send. */
const UNAVAILABLE_SKIP_MS = 45_000;
const QUOTA_EXCEEDED_SKIP_MS = 10 * 60_000;
const MIN_SKIP_MS = 5_000;
const MAX_SKIP_MS = 15 * 60_000;

export interface ModelSkip {
  until: number;
  reason: string;
  code: string;
}

const skips = new Map<string, ModelSkip>();

function skipKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/**
 * A cooldown recorded on one instance (after a rate limit or an outage) needs
 * to reach every other instance, or a model that is "cooling down" on
 * instance A still gets hit by instance B. `peekModelSkip` runs inside
 * AIProviderManager's synchronous fallback-hop loop and cannot become
 * async, so the local Map stays the source of truth for every read; cross-
 * instance propagation instead rides a Redis Pub/Sub channel that every
 * instance both publishes to and applies straight into its own local Map.
 */
const SKIP_CHANNEL = "ken:model-skip:set";
let subscriberStarted = false;

function ensureSubscriber(): void {
  if (subscriberStarted || !redisClient) return;
  subscriberStarted = true;
  const subscriber = redisClient.duplicate();
  subscriber.on("error", (error: Error) => logger.warn({ err: error }, "Redis model-skip subscriber error"));
  subscriber.on("message", (_channel: string, raw: string) => {
    try {
      const { key, entry } = JSON.parse(raw) as { key: string; entry: ModelSkip };
      if (key && entry?.until > Date.now()) skips.set(key, entry);
    } catch {
      // Ignore a malformed cross-instance skip message.
    }
  });
  void subscriber
    .subscribe(SKIP_CHANNEL)
    .catch((error: Error) => logger.warn({ err: error }, "Redis model-skip subscribe failed"));
}

function publishSkip(key: string, entry: ModelSkip): void {
  if (!redisClient) return;
  void redisClient
    .publish(SKIP_CHANNEL, JSON.stringify({ key, entry }))
    .catch((error: Error) => logger.warn({ err: error }, "Redis model-skip publish failed"));
}

export function clearModelSkips(): void {
  skips.clear();
  persistSkips();
}

export function peekModelSkip(providerId: string, modelId: string): ModelSkip | undefined {
  ensureSkipCache();
  const entry = skips.get(skipKey(providerId, modelId));
  if (!entry) return undefined;
  if (entry.until <= Date.now()) {
    skips.delete(skipKey(providerId, modelId));
    persistSkips();
    return undefined;
  }
  return entry;
}

/** Next Gemini catalog hop that is not cooled down. Prefers the current default first. */
export function nextOpenGeminiModelId(currentId: string): string | undefined {
  return GEMINI_PRIMARY_MODEL_IDS.find((id) => id !== currentId && !peekModelSkip("gemini", id));
}

/**
 * Remember a model that just failed with a retryable quota or hang so the next
 * turn does not pay for another dead round-trip. Honours Google's
 * "Please retry in 49s" when present.
 */
export function rememberModelSkip(providerId: string, modelId: string, error: unknown): void {
  ensureSkipCache();
  const retryMs = skipDurationMs(error);
  if (retryMs === undefined) return;
  const key = skipKey(providerId, modelId);
  const entry: ModelSkip = {
    until: Date.now() + retryMs,
    reason: formatFallbackReason(error),
    code: error instanceof AppError ? error.code : "PROVIDER_ERROR",
  };
  skips.set(key, entry);
  persistSkips();
  publishSkip(key, entry);
  const extra = error instanceof AppError ? error.extra : undefined;
  const errorClass = extraString(extra, "errorClass");
  // Workers AI neurons are account-wide. A 3B 429 would otherwise immediately
  // spend another round-trip on 1B, then again in 30s, against an empty daily bucket.
  const skipProvider =
    isProviderLeaveError(error) || (providerId === "cloudflare" && errorClass === "quota_exceeded");
  if (skipProvider && modelId !== PROVIDER_SKIP_MODEL_ID) {
    const providerKey = skipKey(providerId, PROVIDER_SKIP_MODEL_ID);
    skips.set(providerKey, entry);
    persistSkips();
    publishSkip(providerKey, entry);
  }
  logger.info(
    telemetry({
      event: "model_skip_set",
      providerId,
      modelId,
      skipMs: retryMs,
      skipUntil: entry.until,
      skipCode: entry.code,
      skipReason: entry.reason,
      errorClass,
      providerWide: skipProvider,
    }),
    "model skip recorded",
  );
}

/** True when a vendor 401/403 cooled down every model on this provider. */
export function isProviderBlocked(providerId: string): boolean {
  return peekModelSkip(providerId, PROVIDER_SKIP_MODEL_ID) !== undefined;
}

function ensureSkipCache(): void {
  ensureSubscriber();
  if (loadedFromDisk) return;
  loadedFromDisk = true;
  try {
    if (!existsSync(SKIP_FILE)) return;
    const parsed = JSON.parse(readFileSync(SKIP_FILE, "utf8")) as Array<[string, ModelSkip]>;
    const now = Date.now();
    for (const [key, entry] of parsed) {
      if (entry?.until > now && entry.reason && entry.code) skips.set(key, entry);
    }
  } catch {
    // Corrupt cache must not block chat.
  }
}

function persistSkips(): void {
  try {
    writeFileSync(SKIP_FILE, JSON.stringify([...skips.entries()]));
  } catch {
    // Disk is optional; in-memory skip still covers this process.
  }
}

/** Ken's own per-user limits. They describe one account, never the model's health. */
const APP_LIMIT_CODES: ReadonlySet<string> = new Set(["RATE_LIMITED", "SPEND_CEILING_REACHED"]);

export function skipDurationMs(error: unknown): number | undefined {
  if (!(error instanceof AppError)) return undefined;
  // Caching these would cool the model down for every other user as well.
  if (APP_LIMIT_CODES.has(error.code)) return undefined;
  const extra = error.extra;
  const hinted = extra && typeof extra.retryAfterMs === "number" ? extra.retryAfterMs : undefined;
  const errorClass = extra && typeof extra.errorClass === "string" ? extra.errorClass : undefined;
  if (error.code === "PROVIDER_RATE_LIMITED" || error.statusCode === 429) {
    // Free-tier daily exhaustion often arrives with a sub-second RPM "retry in".
    // Honouring 136ms would put 3.8 back on the next turn immediately.
    if (errorClass === "quota_exceeded") {
      return clampSkip(Math.max(hinted ?? 0, QUOTA_EXCEEDED_SKIP_MS));
    }
    return clampSkip(hinted ?? DEFAULT_RATE_LIMIT_SKIP_MS);
  }
  if (error.code === "PROVIDER_UNAVAILABLE" || error.statusCode === 503) {
    return clampSkip(UNAVAILABLE_SKIP_MS);
  }
  if (error.code === "PROVIDER_INVALID_CREDENTIALS") {
    return clampSkip(UNAVAILABLE_SKIP_MS);
  }
  return undefined;
}

function clampSkip(ms: number): number {
  return Math.min(MAX_SKIP_MS, Math.max(MIN_SKIP_MS, Math.round(ms)));
}

export function formatFallbackReason(error: unknown): string {
  if (error instanceof AppError) {
    const parts = [error.code, String(error.statusCode)];
    const extra = error.extra;
    const httpStatus = extra && typeof extra.httpStatus === "number" ? extra.httpStatus : undefined;
    if (httpStatus !== undefined && httpStatus !== error.statusCode) {
      parts.push(String(httpStatus));
    }
    const klass = extra && typeof extra.errorClass === "string" ? extra.errorClass : undefined;
    if (klass) parts.push(klass);
    return parts.join("|");
  }
  if (isAbortError(error)) return "PROVIDER_UNAVAILABLE|timeout";
  return "PROVIDER_ERROR";
}

export function classifyProviderMessage(message?: string): string | undefined {
  if (!message) return undefined;
  if (
    /quota exceeded|exceeded your current quota|rate.?limit|used up your daily free allocation|daily free allocation of .+ neurons/i.test(
      message,
    )
  ) {
    return "quota_exceeded";
  }
  if (/unavailable|overloaded|high demand|try again later/i.test(message)) return "unavailable";
  return undefined;
}

export function parseRetryAfterMs(message?: string): number | undefined {
  if (!message) return undefined;
  const match = /retry in\s+([\d.]+)\s*s/i.exec(message);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return Math.round(seconds * 1000);
}
