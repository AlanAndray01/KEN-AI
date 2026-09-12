import { describe, expect, it } from "vitest";
import { installProviderHttpKeepAlive, warmupGeminiConnection } from "./http.js";

describe("http keep-alive", () => {
  it("installs without throwing", () => {
    expect(() => installProviderHttpKeepAlive()).not.toThrow();
  });

  it("does nothing when no Gemini key is configured", async () => {
    await expect(warmupGeminiConnection(undefined)).resolves.toBeUndefined();
  });
});
