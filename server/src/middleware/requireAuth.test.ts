import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/AppError.js";
import { requireAdmin } from "../middleware/requireAuth.js";

describe("requireAdmin", () => {
  it("rejects authenticated non-admin users with 403", () => {
    const req = {
      auth: {
        userId: "u1",
        sessionId: "s1",
        role: "user",
        user: { id: "u1", name: "A", email: "a@example.com", role: "user" },
      },
    } as Request;
    const next = vi.fn();
    requireAdmin(req, {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 403, code: "FORBIDDEN" });
  });
});
