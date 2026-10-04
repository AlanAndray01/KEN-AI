import { describe, expect, it } from "vitest";
import { toPublicMessage } from "./toPublic.js";

describe("public generation errors", () => {
  it("exposes a redacted error explanation without exposing private metadata", () => {
    const message = toPublicMessage({ id: "message", conversationId: "conversation", role: "assistant", status: "error",
      metadata: { errorCode: "PROVIDER_RATE_LIMITED", errorMessage: "Cloudflare daily quota reached. api_key=private-key",
        privateField: "private metadata" } });
    expect(message.errorCode).toBe("PROVIDER_RATE_LIMITED");
    expect(message.errorMessage).toContain("Cloudflare daily quota reached");
    expect(JSON.stringify(message)).not.toMatch(/private-key|private metadata/);
  });

  it("does not expose stale error metadata on a completed reply", () => {
    const message = toPublicMessage({ conversationId: "conversation", role: "assistant", status: "complete",
      metadata: { errorCode: "PROVIDER_ERROR", errorMessage: "old error" } });
    expect(message.errorCode).toBeUndefined();
    expect(message.errorMessage).toBeUndefined();
  });
});
