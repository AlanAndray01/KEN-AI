import { describe, expect, it } from "vitest";
import { resolveImageGenerationBackend } from "./index.js";

describe("resolveImageGenerationBackend", () => {
  it("keeps IMAGE_GENERATION_PROVIDER=openai on DALL·E even when Gemini is configured", () => {
    expect(
      resolveImageGenerationBackend({
        provider: "openai",
        openaiKey: "sk-test",
        geminiKey: "gemini-test",
      }),
    ).toBe("openai");
  });

  it("uses Nano Banana (Gemini) when GEMINI_API_KEY is present and no provider is forced", () => {
    expect(resolveImageGenerationBackend({ geminiKey: "gemini-test" })).toBe("gemini");
  });

  it("uses Gemini when IMAGE_GENERATION_PROVIDER=gemini", () => {
    expect(resolveImageGenerationBackend({ provider: "gemini", geminiKey: "gemini-test" })).toBe("gemini");
  });

  it("stays unconfigured when no image key is present", () => {
    expect(resolveImageGenerationBackend({})).toBe("none");
  });
});
