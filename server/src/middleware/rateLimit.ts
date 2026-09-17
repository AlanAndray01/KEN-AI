import type { NextFunction, Request, Response } from "express";
import { env, isTest } from "../config/env.js";
import { logger } from "../config/logger.js";
import { redisClient } from "../config/redis.js";
import { AppError } from "../utils/AppError.js";

export interface RateLimitWindow {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface RateLimitStore {
  consume(key: string): Promise<RateLimitResult>;
  /** Reads the current window without consuming from it. */
  peek(key: string): Promise<RateLimitWindow | undefined>;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, RateLimitWindow>();
  private seen = 0;

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  async consume(key: string, now = Date.now()): Promise<RateLimitResult> {
    this.seen += 1;
    if (this.seen % 200 === 0) this.prune(now);

    const current = this.hits.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + this.windowMs;
      this.hits.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: Math.max(this.max - 1, 0), resetAt, limit: this.max };
    }

    if (current.count >= this.max) {
      return { allowed: false, remaining: 0, resetAt: current.resetAt, limit: this.max };
    }

    current.count += 1;
    return {
      allowed: true,
      remaining: Math.max(this.max - current.count, 0),
      resetAt: current.resetAt,
      limit: this.max,
    };
  }

  get(key: string, now = Date.now()): RateLimitWindow | undefined {
    const current = this.hits.get(key);
    if (!current || current.resetAt <= now) {
      if (current) this.hits.delete(key);
      return undefined;
    }
    return current;
  }

  async peek(key: string): Promise<RateLimitWindow | undefined> {
    return this.get(key);
  }

  prune(now = Date.now()): void {
    for (const [key, window] of this.hits) {
      if (window.resetAt <= now) this.hits.delete(key);
    }
  }

  clear(): void {
    this.hits.clear();
  }
}

const INCR_WITH_WINDOW_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return {count, ttl}
`;

/**
 * A fixed-window counter shared over Redis so every instance enforces the
 * same limit instead of each process getting its own budget. INCR + a
 * conditional PEXPIRE (only set on the first hit of the window) run as one
 * Lua script so two instances racing to open a window can't each set their
 * own TTL and quietly extend it.
 *
 * Falls open (allows the request, logs a warning) on a Redis error —
 * rate limiting must not take chat down because Redis blipped.
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly name: string,
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  async consume(key: string): Promise<RateLimitResult> {
    if (!redisClient) {
      return { allowed: true, remaining: this.max, resetAt: Date.now() + this.windowMs, limit: this.max };
    }
    try {
      const [count, ttl] = (await redisClient.eval(
        INCR_WITH_WINDOW_SCRIPT,
        1,
        `ratelimit:${this.name}:${key}`,
        this.windowMs,
      )) as [number, number];
      const resetAt = Date.now() + Math.max(ttl, 0);
      if (count > this.max) {
        return { allowed: false, remaining: 0, resetAt, limit: this.max };
      }
      return { allowed: true, remaining: Math.max(this.max - count, 0), resetAt, limit: this.max };
    } catch (error) {
      logger.warn({ err: error, limiter: this.name }, "Redis rate limit check failed; allowing request");
      return { allowed: true, remaining: this.max, resetAt: Date.now() + this.windowMs, limit: this.max };
    }
  }

  async peek(key: string): Promise<RateLimitWindow | undefined> {
    if (!redisClient) return undefined;
    try {
      const redisKey = `ratelimit:${this.name}:${key}`;
      const [count, ttl] = await Promise.all([redisClient.get(redisKey), redisClient.pttl(redisKey)]);
      if (!count || ttl <= 0) return undefined;
      return { count: Number(count), resetAt: Date.now() + ttl };
    } catch (error) {
      logger.warn({ err: error, limiter: this.name }, "Redis rate limit peek failed");
      return undefined;
    }
  }
}

export interface RateLimitOptions {
  /** Unique per limiter — namespaces its keys in Redis so limiters don't share a counter. */
  name: string;
  windowMs: number;
  max: number;
  /** When true, the limiter runs even in NODE_ENV=test. */
  enabledInTest?: boolean;
  keyGenerator?: (req: Request) => string;
}

export function clientKey(req: Request): string {
  const userId = req.auth?.userId;
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return userId ? `${userId}:${ip}` : ip;
}

export function createRateLimit(options: RateLimitOptions) {
  const store: RateLimitStore = redisClient
    ? new RedisRateLimitStore(options.name, options.windowMs, options.max)
    : new MemoryRateLimitStore(options.windowMs, options.max);
  const keyGenerator = options.keyGenerator ?? clientKey;

  // Returns a Promise so tests can await one call at a time; Express 4 does
  // not await a middleware's return value, it only cares that next() runs,
  // so this is a no-op difference in production.
  return async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (isTest && !options.enabledInTest) {
      next();
      return;
    }

    try {
      const result = await store.consume(keyGenerator(req));
      res.setHeader("X-RateLimit-Limit", String(result.limit));
      res.setHeader("X-RateLimit-Remaining", String(result.remaining));
      res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

      if (!result.allowed) {
        const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
        res.setHeader("Retry-After", String(retryAfter));
        next(
          new AppError("Too many requests. Try again later.", {
            statusCode: 429,
            code: "RATE_LIMITED",
          }),
        );
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const rateLimitAuth = createRateLimit({
  name: "auth",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH,
});

export const rateLimitPasswordReset = createRateLimit({
  name: "password-reset",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_PASSWORD_RESET,
});

export const rateLimitChat = createRateLimit({
  name: "chat",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_CHAT,
});

export const rateLimitUpload = createRateLimit({
  name: "upload",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_UPLOAD,
});

export const rateLimitSearch = createRateLimit({
  name: "search",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_SEARCH,
});

export const rateLimitImage = createRateLimit({
  name: "image",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_IMAGE,
});

export const rateLimitVoice = createRateLimit({
  name: "voice",
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_VOICE,
});
