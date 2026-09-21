import { describe, expect, it } from "vitest";
import { geminiEmptyReplyError } from "./geminiReply.js";

describe("geminiEmptyReplyError", () => {
  it("returns nothing when the candidate has text", () => {
    expect(geminiEmptyReplyError({ text: "Hello", finishReason: "STOP" })).toBeUndefined();
  });

  it("treats an empty candidate list as a retryable error", () => {
    const error = geminiEmptyReplyError({ text: "", candidateCount: 0, payload: { candidates: [] } });
    expect(error).toMatchObject({ code: "PROVIDER_ERROR", statusCode: 502 });
    expect(error?.message).toMatch(/empty reply/i);
  });

  it("treats a safety finish reason as a blocked reply", () => {
    const error = geminiEmptyReplyError({ text: "", finishReason: "SAFETY" });
    expect(error).toMatchObject({ code: "PROVIDER_ERROR" });
    expect(error?.message).toMatch(/blocked/i);
    expect(error?.extra).toMatchObject({ errorClass: "safety" });
  });

  it("reads promptFeedback.blockReason", () => {
    const error = geminiEmptyReplyError({
      text: "",
      payload: { promptFeedback: { blockReason: "SAFETY" } },
    });
    expect(error?.extra).toMatchObject({ errorClass: "safety", finishReason: "SAFETY" });
  });
});
