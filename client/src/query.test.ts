import { describe, expect, it } from "vitest";
import { conversationIdFromPath } from "./query";

describe("conversationIdFromPath", () => {
  it("reads a thread id from /chat/:id and ignores the empty composer route", () => {
    expect(conversationIdFromPath("/chat")).toBeUndefined();
    expect(conversationIdFromPath("/chat/")).toBeUndefined();
    expect(conversationIdFromPath("/library")).toBeUndefined();
    expect(conversationIdFromPath("/chat/abc-123")).toBe("abc-123");
  });
});
