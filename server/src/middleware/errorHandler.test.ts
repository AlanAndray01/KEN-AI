import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { errorHandler } from "./errorHandler.js";
import { hasLeakedSecret } from "../utils/redact.js";

function mockRes() {
  const state: { statusCode?: number; body?: unknown } = {};
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(body: unknown) {
      state.body = body;
      return res;
    },
  };
  return { res: res as unknown as Response, state };
}

describe("errorHandler", () => {
  it("maps Zod errors to 400 and does not leak secrets", () => {
    const { res, state } = mockRes();
    const req = { path: "/api/auth/login", method: "POST", requestId: "r1" } as Request;
    const parsed = z.object({ email: z.string().email() }).safeParse({ email: "not-an-email" });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    errorHandler(parsed.error, req, res, vi.fn() as NextFunction);
    expect(state.statusCode).toBe(400);
    const body = JSON.stringify(state.body);
    expect(body).toContain("VALIDATION_ERROR");
    expect(hasLeakedSecret(body)).toBe(false);
  });

  it("maps oversized payloads to 413", () => {
    const { res, state } = mockRes();
    const req = { path: "/api/chat", method: "POST" } as Request;
    const err = Object.assign(new Error("entity too large"), { type: "entity.too.large", status: 413 });
    errorHandler(err, req, res, vi.fn() as NextFunction);
    expect(state.statusCode).toBe(413);
    expect((state.body as { error: { code: string } }).error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("redacts secrets from unexpected error messages", () => {
    const { res, state } = mockRes();
    const req = { path: "/api/health", method: "GET" } as Request;
    errorHandler(
      new Error("Failed mongodb+srv://user:hunter2@cluster0.example.mongodb.net/aether"),
      req,
      res,
      vi.fn() as NextFunction,
    );
    const body = JSON.stringify(state.body);
    expect(state.statusCode).toBe(500);
    expect(hasLeakedSecret(body)).toBe(false);
    expect(body).not.toContain("hunter2");
  });
});
