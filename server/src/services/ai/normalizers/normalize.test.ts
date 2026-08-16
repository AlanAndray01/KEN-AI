import { describe, expect, it } from "vitest";
import { normalizeAIResponse, toProviderContents } from "./normalize.js";

describe("AI response normalizers", () => {
  it("maps vendor finish reasons onto AIResponse", () => {
    expect(normalizeAIResponse({ content: "hi", model: "m", provider: "p", finishReason: "STOP" }).finishReason).toBe(
      "stop",
    );
    expect(
      normalizeAIResponse({ content: "hi", model: "m", provider: "p", finishReason: "max_tokens" }).finishReason,
    ).toBe("length");
  });

  it("splits system messages out of Gemini contents", () => {
    const result = toProviderContents([
      { role: "system", content: "Be brief" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi" },
    ]);

    expect(result.system).toBe("Be brief");
    expect(result.contents).toEqual([
      { role: "user", parts: [{ text: "Hello" }] },
      { role: "model", parts: [{ text: "Hi" }] },
    ]);
  });

  it("includes inline image parts for Gemini", () => {
    const result = toProviderContents([
      {
        role: "user",
        content: "What is this?",
        parts: [{ type: "inline", mimeType: "image/png", data: "AAAA" }],
      },
    ]);
    expect(result.contents[0]?.parts).toEqual([
      { text: "What is this?" },
      { inlineData: { mimeType: "image/png", data: "AAAA" } },
    ]);
  });
});
