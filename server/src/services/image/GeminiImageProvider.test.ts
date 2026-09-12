import { afterEach, describe, expect, it, vi } from "vitest";
import { GEMINI_IMAGE_MODEL_ID } from "@Ken/shared";
import { extractInlineImage, GeminiImageProvider } from "./GeminiImageProvider.js";

describe("GeminiImageProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is configured when a Gemini key is present", () => {
    const provider = new GeminiImageProvider("test-key");
    expect(provider.isConfigured()).toBe(true);
    expect(provider.id).toBe("gemini");
  });

  it("calls the official Nano Banana generateContent endpoint", async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain(GEMINI_IMAGE_MODEL_ID);
      expect(String(url)).toContain(":generateContent");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }],
              },
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiImageProvider("test-key");
    const result = await provider.generate({ prompt: "a lighthouse", userId: "u1" });
    expect(result.mimeType).toBe("image/png");
    expect(result.buffer.toString("base64")).toBe("QUJD");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("extractInlineImage", () => {
  it("reads snake_case inline_data from Gemini", () => {
    expect(
      extractInlineImage({
        candidates: [{ content: { parts: [{ inline_data: { mime_type: "image/jpeg", data: "QQ" } }] } }],
      }),
    ).toEqual({ mimeType: "image/jpeg", data: "QQ" });
  });

  it("returns undefined when no image part is present", () => {
    expect(extractInlineImage({ candidates: [{ content: { parts: [{ text: "nope" }] } }] })).toBeUndefined();
  });
});
