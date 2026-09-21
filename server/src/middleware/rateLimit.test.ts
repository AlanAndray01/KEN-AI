import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";
import { consumeImageGenerationLimit, createRateLimit, imageLimitKey } from "./rateLimit.js";
import { AppError } from "../utils/AppError.js";

function mockReq(ip = "1.1.1.1"): Request {
  return { ip, auth: undefined, socket: { remoteAddress: ip } } as unknown as Request;
}

function mockRes(): Response & { headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  return {
    headers,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = String(value);
      return this;
    },
  } as unknown as Response & { headers: Record<string, string> };
}

describe("createRateLimit", () => {
  it("returns 429 after the max requests in a window", async () => {
    const limit = createRateLimit({
      name: "test",
      windowMs: 60_000,
      max: 2,
      enabledInTest: true,
    });
    const res = mockRes();
    const next = vi.fn();

    await limit(mockReq(), res, next as NextFunction);
    await limit(mockReq(), res, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[0]?.[0]).toBeUndefined();

    await limit(mockReq(), res, next as NextFunction);
    const error = next.mock.calls[2]?.[0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["x-ratelimit-limit"]).toBe("2");
  });

  it("keys image limits by user id so chat draws and POST /tools/images share a bucket", () => {
    const req = { ip: "1.2.3.4", auth: { userId: "user-1" }, socket: { remoteAddress: "1.2.3.4" } } as unknown as Request;
    expect(imageLimitKey(req)).toBe("user-1");
  });

  it("shares the image bucket across consumeImageGenerationLimit calls for one user", async () => {
    const userId = `img-limit-${Date.now()}-${Math.random()}`;
    const max = env.RATE_LIMIT_IMAGE;
    for (let i = 0; i < max; i += 1) {
      await consumeImageGenerationLimit(userId, { enabledInTest: true });
    }
    await expect(consumeImageGenerationLimit(userId, { enabledInTest: true })).rejects.toMatchObject({
      statusCode: 429,
      code: "RATE_LIMITED",
      message: expect.stringContaining("image generation"),
    });
  });

  it("does not count one user's image gens against another user", async () => {
    const a = `img-a-${Date.now()}-${Math.random()}`;
    const b = `img-b-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < env.RATE_LIMIT_IMAGE; i += 1) {
      await consumeImageGenerationLimit(a, { enabledInTest: true });
    }
    await expect(consumeImageGenerationLimit(b, { enabledInTest: true })).resolves.toBeUndefined();
  });

  it("does not consume the image bucket in tests unless enabledInTest is set", async () => {
    const userId = `img-skip-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < env.RATE_LIMIT_IMAGE + 2; i += 1) {
      await expect(consumeImageGenerationLimit(userId)).resolves.toBeUndefined();
    }
  });
});
