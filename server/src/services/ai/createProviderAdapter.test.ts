import { describe, expect, it, vi } from "vitest";
import { createProviderAdapter } from "./createProviderAdapter.js";
import { GeminiProvider } from "./providers/GeminiProvider.js";

vi.mock("./providers/MockProvider.js", () => ({
  isMockAiAllowed: () => false,
  MockProvider: class MockProvider {},
}));

describe("createProviderAdapter", () => {
  it("builds a Gemini adapter for leftover and new Gemini configs", () => {
    const adapter = createProviderAdapter({
      id: "gemini",
      name: "Google Gemini",
      type: "gemini",
      credentials: { apiKey: "test-key" },
    });
    expect(adapter).toBeInstanceOf(GeminiProvider);
    expect(adapter.type).toBe("gemini");
  });
});
