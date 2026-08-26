import { AppError } from "../../utils/AppError.js";
import type { PublicSearchHit } from "@Ken/shared";
import type { SearchProvider, SearchRequest } from "./SearchProvider.js";

export class UnconfiguredSearchProvider implements SearchProvider {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  unavailableReason(): string {
    return "Web search is not configured. Set SEARCH_PROVIDER and SEARCH_API_KEY.";
  }

  async search(_request: SearchRequest): Promise<PublicSearchHit[]> {
    throw new AppError(this.unavailableReason(), {
      statusCode: 503,
      code: "SEARCH_NOT_CONFIGURED",
      expose: true,
    });
  }
}
