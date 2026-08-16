import { AppError } from "../../utils/AppError.js";
import type { PublicSearchHit } from "@aether/shared";
import type { SearchProvider, SearchRequest } from "./SearchProvider.js";

export class BraveSearchProvider implements SearchProvider {
  readonly id = "brave";

  constructor(private readonly apiKey: string) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  unavailableReason(): string {
    return "Web search is not configured. Set SEARCH_API_KEY for Brave.";
  }

  async search(request: SearchRequest): Promise<PublicSearchHit[]> {
    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", request.query);
    url.searchParams.set("count", "5");
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey,
      },
    });
    if (!response.ok) {
      throw new AppError("Search provider request failed", { statusCode: 502, code: "SEARCH_PROVIDER_ERROR" });
    }
    const body = (await response.json()) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };
    return (body.web?.results ?? [])
      .filter((hit) => hit.title && hit.url)
      .map((hit) => ({
        title: hit.title ?? "",
        url: hit.url ?? "",
        snippet: (hit.description ?? "").slice(0, 400),
      }));
  }
}
