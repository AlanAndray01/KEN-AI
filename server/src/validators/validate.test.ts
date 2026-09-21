import { describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { listMessagesQuerySchema } from "@Ken/shared";
import { AppError } from "../utils/AppError.js";
import { validateBody, validateQuery } from "./validate.js";
import { z } from "zod";

function run(
  middleware: (req: Request, res: Response, next: NextFunction) => void,
  req: Partial<Request>,
): unknown {
  const next = vi.fn();
  middleware(req as Request, {} as Response, next as NextFunction);
  return next.mock.calls[0]?.[0];
}

describe("validateQuery", () => {
  it("passes a valid messages query through", () => {
    expect(run(validateQuery(listMessagesQuerySchema), { query: { limit: "32" } })).toBeUndefined();
  });

  it("maps an invalid limit to VALIDATION_ERROR", () => {
    const error = run(validateQuery(listMessagesQuerySchema), { query: { limit: "abc" } });
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });
});

describe("validateBody", () => {
  it("replaces req.body with the parsed value", () => {
    const schema = z.object({ prompt: z.string().min(1) });
    const req = { body: { prompt: " a cat " } } as Request;
    expect(run(validateBody(schema), req)).toBeUndefined();
    expect(req.body).toEqual({ prompt: " a cat " });
  });
});
