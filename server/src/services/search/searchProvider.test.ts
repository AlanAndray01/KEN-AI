import { afterEach, describe, expect, it, vi } from "vitest";
import { TavilySearchProvider } from "./TavilySearchProvider.js";
import { UnconfiguredSearchProvider } from "./UnconfiguredSearchProvider.js";

describe("search providers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not invent hits when search is unconfigured", async () => {
    const provider = new UnconfiguredSearchProvider();
    await expect(provider.search({ query: "anything" })).rejects.toMatchObject({
      code: "SEARCH_NOT_CONFIGURED",
    });
  });

  it("maps Tavily results without fabricating extra hits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          results: [{ title: "Docs", url: "https://docs.example", content: "Official docs" }],
        }),
      })),
    );
    const provider = new TavilySearchProvider("test-key");
    const hits = await provider.search({ query: "Ken" });
    expect(hits).toEqual([
      { title: "Docs", url: "https://docs.example", snippet: "Official docs" },
    ]);
  });
});
