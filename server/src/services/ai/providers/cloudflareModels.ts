/**
 * Cloudflare Workers AI model listing.
 *
 * Workers AI serves chat through an OpenAI-compatible base URL
 * (".../ai/v1/chat/completions") but never implemented the OpenAI listing
 * route: "GET .../ai/v1/models" answers 405 "GET not supported for requested
 * URI" even for a valid, fully-scoped token. The real catalogue lives on
 * Cloudflare's own REST path, one level up from /v1, and returns models under
 * `result[].name` rather than OpenAI's `data[].id`.
 *
 * Kept free of Mongoose and provider-class imports so both the credential
 * probe and the offline drift script can use it.
 */

/** Cloudflare's OpenAI-compatible base URL always ends here. */
const OPENAI_COMPAT_SUFFIX = "/ai/v1";

interface CloudflareModelSearchResponse {
  result?: Array<{ name?: string }>;
}

/**
 * Workers AI model-listing URL derived from an OpenAI-compatible base URL.
 *
 * Returns undefined for a base URL that is not Cloudflare's documented shape —
 * an admin pointing the provider at a proxy is better served by the standard
 * "/models" probe than by a guessed path.
 */
export function cloudflareModelsUrl(baseUrl: string): string | undefined {
  const trimmed = baseUrl.replace(/\/$/, "");
  if (!trimmed.endsWith(OPENAI_COMPAT_SUFFIX)) return undefined;
  return `${trimmed.slice(0, -OPENAI_COMPAT_SUFFIX.length)}/ai/models/search`;
}

/** Model ids from one page of a Workers AI model-search response. */
export function parseCloudflareModelIds(body: unknown): string[] {
  const result = (body as CloudflareModelSearchResponse | null)?.result;
  if (!Array.isArray(result)) return [];
  return result.map((entry) => entry?.name).filter((name): name is string => Boolean(name));
}
