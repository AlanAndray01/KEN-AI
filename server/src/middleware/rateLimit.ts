import type { NextFunction, Request, Response } from "express";
import { env, isTest } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export interface RateLimitWindow {
  count: number;
  resetAt: number;
}

export class MemoryRateLimitStore {
  private readonly hits = new Map<string, RateLimitWindow>();
  private seen = 0;

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {}

  consume(key: string, now = Date.now()): { allowed: boolean; remaining: number; resetAt: number; limit: number } {
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

  prune(now = Date.now()): void {
    for (const [key, window] of this.hits) {
      if (window.resetAt <= now) this.hits.delete(key);
    }
  }

  clear(): void {
    this.hits.clear();
  }
}

export interface RateLimitOptions {
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
  const store = new MemoryRateLimitStore(options.windowMs, options.max);
  const keyGenerator = options.keyGenerator ?? clientKey;

  function middleware(req: Request, res: Response, next: NextFunction): void {
    if (isTest && !options.enabledInTest) {
      next();
      return;
    }

    const result = store.consume(keyGenerator(req));
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
  }

  return middleware;
}

export const rateLimitAuth = createRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH,
});

export const rateLimitPasswordReset = createRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_PASSWORD_RESET,
});

export const rateLimitChat = createRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_CHAT,
});

export const rateLimitUpload = createRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_UPLOAD,
});

export const rateLimitSearch = createRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_SEARCH,
});

export const rateLimitImage = createRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_IMAGE,
});

export const rateLimitVoice = createRateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_VOICE,
});
