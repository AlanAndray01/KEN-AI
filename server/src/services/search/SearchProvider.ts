import type { PublicSearchHit } from "@aether/shared";

export interface SearchRequest {
  query: string;
}

export interface SearchProvider {
  readonly id: string;
  isConfigured(): boolean;
  unavailableReason(): string;
  search(request: SearchRequest): Promise<PublicSearchHit[]>;
}
