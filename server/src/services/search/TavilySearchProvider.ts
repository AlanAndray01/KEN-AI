import { AppError } from "../../utils/AppError.js";
import type { PublicSearchHit } from "@Ken/shared";
import type { SearchProvider, SearchRequest } from "./SearchProvider.js";

export class TavilySearchProvider implements SearchProvider {
  readonly id = "tavily";

  constructor(private readonly apiKey: string) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  unavailableReason(): string {
    return "Web search is not configured. Set SEARCH_API_KEY for Tavily.";
  }

  async search(request: SearchRequest): Promise<PublicSearchHit[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.apiKey,
        query: request.query,
        max_results: 5,
        include_answer: false,
      }),
    });
    if (!response.ok) {
      throw new AppError("Search provider request failed", { statusCode: 502, code: "SEARCH_PROVIDER_ERROR" });
    }
    const body = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    return (body.results ?? [])
      .filter((hit) => hit.title && hit.url)
      .map((hit) => ({
        title: hit.title ?? "",
        url: hit.url ?? "",
        snippet: (hit.content ?? "").slice(0, 400),
      }));
  }
}
