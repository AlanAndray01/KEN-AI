import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiProvider } from "./GeminiProvider.js";

const TEST_KEY = "test-gemini-key-zzzz";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("GeminiProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the API key in x-goog-api-key and never in the URL", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).not.toContain("key=");
      expect(url).not.toContain(TEST_KEY);
      const headers = new Headers(init?.headers);
      expect(headers.get("x-goog-api-key")).toBe(TEST_KEY);
      return jsonResponse({
        candidates: [{ content: { parts: [{ text: "hello from gemini" }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider({
      id: "gemini",
      name: "Google Gemini",
      type: "gemini",
      credentials: { apiKey: TEST_KEY },
    });

    const result = await provider.generate({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("hello from gemini");
    expect(result.provider).toBe("gemini");
    expect(result.finishReason).toBe("stop");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not put the key in validateCredentials request URLs", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).not.toContain("key=");
      return jsonResponse({ models: [] });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeminiProvider({
      id: "gemini",
      name: "Google Gemini",
      type: "gemini",
      credentials: { apiKey: TEST_KEY },
    });

    await expect(provider.validateCredentials()).resolves.toMatchObject({ status: "connected" });
  });
});
