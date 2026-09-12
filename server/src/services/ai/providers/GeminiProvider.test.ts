import { afterEach, describe, expect, it, vi } from "vitest";
import { GEMINI_OPENAI_BASE_URL, GeminiProvider } from "./GeminiProvider.js";

describe("GeminiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it("sends PDF attachments on the native generateContent URL", async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain(":generateContent");
      expect(String(url)).not.toContain("/openai");
      expect(init?.headers).toMatchObject({ "x-goog-api-key": "test-key" });
      const body = JSON.parse(String(init?.body)) as {
        contents: Array<{ parts: Array<{ inlineData?: { mimeType: string; data: string } }> }>;
      };
      expect(body.contents[0]?.parts).toEqual(
        expect.arrayContaining([{ inlineData: { mimeType: "application/pdf", data: "JVBER" } }]),
      );
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "A one-page report." }] }, finishReason: "STOP" }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider({
      id: "gemini",
      name: "Google Gemini",
      type: "gemini",
      credentials: { apiKey: "test-key" },
    });
    const result = await provider.generate({
      providerId: "gemini",
      modelId: "gemini-3.5-flash-lite",
      messages: [
        {
          role: "user",
          content: "Summarise this",
          parts: [{ type: "inline", mimeType: "application/pdf", data: "JVBER", filename: "report.pdf" }],
        },
      ],
    });

    expect(result.content).toBe("A one-page report.");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
