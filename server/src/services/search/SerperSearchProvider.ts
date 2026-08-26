import { AppError } from "../../utils/AppError.js";
import type { PublicSearchHit } from "@Ken/shared";
import type { SearchProvider, SearchRequest } from "./SearchProvider.js";

export class SerperSearchProvider implements SearchProvider {
  readonly id = "serper";

  constructor(private readonly apiKey: string) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  unavailableReason(): string {
    return "Web search is not configured. Set SEARCH_API_KEY for Serper.";
  }

  async search(request: SearchRequest): Promise<PublicSearchHit[]> {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify({ q: request.query, num: 5 }),
    });
    if (!response.ok) {
      throw new AppError("Search provider request failed", { statusCode: 502, code: "SEARCH_PROVIDER_ERROR" });
    }
    const body = (await response.json()) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
    };
    return (body.organic ?? [])
      .filter((hit) => hit.title && hit.link)
      .map((hit) => ({
        title: hit.title ?? "",
        url: hit.link ?? "",
        snippet: (hit.snippet ?? "").slice(0, 400),
      }));
  }
}
