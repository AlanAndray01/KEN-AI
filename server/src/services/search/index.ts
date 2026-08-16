import { env } from "../../config/env.js";
import { BraveSearchProvider } from "./BraveSearchProvider.js";
import { SerperSearchProvider } from "./SerperSearchProvider.js";
import type { SearchProvider } from "./SearchProvider.js";
import { TavilySearchProvider } from "./TavilySearchProvider.js";
import { UnconfiguredSearchProvider } from "./UnconfiguredSearchProvider.js";

export function createSearchProvider(): SearchProvider {
  const key = env.SEARCH_API_KEY;
  if (!env.SEARCH_PROVIDER || !key) {
    return new UnconfiguredSearchProvider();
  }
  if (env.SEARCH_PROVIDER === "tavily") return new TavilySearchProvider(key);
  if (env.SEARCH_PROVIDER === "brave") return new BraveSearchProvider(key);
  return new SerperSearchProvider(key);
}

export const searchProvider: SearchProvider = createSearchProvider();
