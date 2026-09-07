import { describe, expect, it } from "vitest";
import { GEMINI_OPENAI_BASE_URL, GeminiProvider } from "./GeminiProvider.js";

describe("GeminiProvider", () => {
  it("uses Google's OpenAI-compatible base URL when none is supplied", () => {
    const provider = new GeminiProvider({
      id: "gemini",
      name: "Google Gemini",
      type: "gemini",
      credentials: { apiKey: "test-key" },
    });

    expect(provider.type).toBe("gemini");
    expect(provider.id).toBe("gemini");
    expect(GEMINI_OPENAI_BASE_URL).toContain("generativelanguage.googleapis.com");
  });
});
