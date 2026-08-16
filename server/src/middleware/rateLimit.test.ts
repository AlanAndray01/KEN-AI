import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { createRateLimit } from "./rateLimit.js";
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
  it("returns 429 after the max requests in a window", () => {
    const limit = createRateLimit({
      windowMs: 60_000,
      max: 2,
      enabledInTest: true,
    });
    const res = mockRes();
    const next = vi.fn();

    limit(mockReq(), res, next as NextFunction);
    limit(mockReq(), res, next as NextFunction);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[0]?.[0]).toBeUndefined();

    limit(mockReq(), res, next as NextFunction);
    const error = next.mock.calls[2]?.[0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe("RATE_LIMITED");
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["x-ratelimit-limit"]).toBe("2");
  });
});
