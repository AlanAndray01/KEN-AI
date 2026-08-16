import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "./GeminiProvider.js";

const TEST_KEY = "test-gemini-key-zzzz";

describe("GeminiProvider streaming", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("streams SSE tokens without putting the API key in the URL", async () => {
    const payload = [
      "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Hel\"}]}}]}\n\n",
      "data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"lo\"}]},\"finishReason\":\"STOP\"}]}\n\n",
    ].join("");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("streamGenerateContent");
      expect(url).toContain("alt=sse");
      expect(url).not.toContain("key=");
      expect(url).not.toContain(TEST_KEY);
      return new Response(payload, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider({
      id: "gemini",
      name: "Google Gemini",
      type: "gemini",
      credentials: { apiKey: TEST_KEY },
    });

    const chunks: string[] = [];
    for await (const event of provider.stream({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Hi" }],
    })) {
      if (event.type === "chunk") chunks.push(event.text);
    }

    expect(chunks.join("")).toBe("Hello");
  });
});
