import { describe, expect, it } from "vitest";
import { ApiError } from "@/services/api/errors";
import { conversationIdFromPath, shouldRetryQuery } from "./query";

describe("conversationIdFromPath", () => {
  it("reads a thread id from /chat/:id and ignores the empty composer route", () => {
    expect(conversationIdFromPath("/chat")).toBeUndefined();
    expect(conversationIdFromPath("/chat/")).toBeUndefined();
    expect(conversationIdFromPath("/library")).toBeUndefined();
    expect(conversationIdFromPath("/chat/abc-123")).toBe("abc-123");
  });
});

describe("shouldRetryQuery", () => {
  const apiError = (status: number) => new ApiError("x", { status, code: "X" });

  it("never retries an answer that will not change, like a missing chat", () => {
    expect(shouldRetryQuery(0, apiError(404))).toBe(false);
    expect(shouldRetryQuery(0, apiError(403))).toBe(false);
    expect(shouldRetryQuery(0, apiError(400))).toBe(false);
  });

  it("retries network failures, server errors, timeouts and rate limits up to three times", () => {
    expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetryQuery(1, apiError(503))).toBe(true);
    expect(shouldRetryQuery(2, apiError(429))).toBe(true);
    expect(shouldRetryQuery(0, apiError(408))).toBe(true);
    expect(shouldRetryQuery(3, apiError(503))).toBe(false);
  });
});
