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

  it("uses Flux on Workers AI when IMAGE_GENERATION_PROVIDER=cloudflare", () => {
    expect(
      resolveImageGenerationBackend({
        provider: "cloudflare",
        cloudflare: { accountId: "acct123", apiToken: "cf-token" },
        // Explicit beats present: Gemini is configured and still not chosen.
        geminiKey: "gemini-test",
      }),
    ).toBe("cloudflare");
  });

  it("needs both halves of the Cloudflare credential", () => {
    expect(
      resolveImageGenerationBackend({ provider: "cloudflare", cloudflare: { accountId: "acct123" } }),
    ).toBe("none");
  });

  it("leaves an existing Gemini deployment on Nano Banana when Cloudflare is also configured", () => {
    // Adding Flux must not silently move anyone off the backend they are
    // already generating with, so the implicit order still leads with Gemini.
    expect(
      resolveImageGenerationBackend({
        geminiKey: "gemini-test",
        cloudflare: { accountId: "acct123", apiToken: "cf-token" },
      }),
    ).toBe("gemini");
  });

  it("falls back to Flux when Cloudflare is the only image-capable credential", () => {
    expect(
      resolveImageGenerationBackend({ cloudflare: { accountId: "acct123", apiToken: "cf-token" } }),
    ).toBe("cloudflare");
  });
});
