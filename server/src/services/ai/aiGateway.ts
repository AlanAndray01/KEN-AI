import { env } from "../../config/env.js";

/**
 * Cloudflare AI Gateway addressing.
 *
 * Deliberately free of any database or model imports: this is pure
 * configuration, and keeping it standalone means it can be reasoned about (and
 * tested) without dragging in Mongoose, which credentials.ts does.
 */

/** Every gateway URL starts with this; used to tell a rerouted request from a direct one. */
export const GATEWAY_URL_PREFIX = "https://gateway.ai.cloudflare.com/";

/**
 * AI Gateway path slugs, from Cloudflare's provider list. These are the
 * gateway's own names for each vendor and do not always match ours — Gemini is
 * "google-ai-studio" there.
 *
 * Cloudflare's own models go through the `workers-ai` slug. Chat uses the
 * OpenAI-compatible `/v1` suffix on that slug (verified live: 200 with the
 * gateway token). Flux uses the bare slug plus the model id — there is no `/v1`
 * on the run path.
 */
const GATEWAY_PROVIDER_SLUGS: Readonly<Record<string, string>> = {
  groq: "groq",
  gemini: "google-ai-studio",
  openrouter: "openrouter",
  openai: "openai",
  cloudflare: "workers-ai",
};

/**
 * Path kept after the provider slug, because the gateway proxies each vendor's
 * own URL shape rather than flattening them all to `/chat/completions`.
 *
 * Gemini is the one that actually breaks without this. Its OpenAI-compatible
 * surface lives under `/v1beta/openai`, so the gateway needs
 * `google-ai-studio/v1beta/openai/chat/completions`; the bare slug answers 404
 * (verified live, alongside a 200 on the suffixed path). Groq answers on both
 * its bare slug and `groq/openai/v1`, so it is left bare.
 */
const GATEWAY_PROVIDER_PATHS: Readonly<Record<string, string>> = {
  gemini: "/v1beta/openai",
  cloudflare: "/v1",
};

/**
 * True once an AI Gateway token is configured; until then nothing is rerouted.
 *
 * The token is what the gateway itself checks, separately from any vendor key:
 * an authenticated gateway answers 401 at its own front door before the vendor
 * ever sees the request, so routing traffic there without one would fail every
 * call regardless of how valid the provider credentials are.
 */
export function gatewayEnabled(): boolean {
  return Boolean(!env.CLOUDFLARE_WORKER_URL && env.CF_AI_GATEWAY_TOKEN && env.CF_ACCOUNT_ID);
}

/**
 * Where a provider's requests should go when the gateway is switched on.
 *
 * Returns undefined for a provider the gateway has no slug for, which leaves it
 * on its direct endpoint rather than guessing at a path.
 */
export function gatewayBaseUrl(providerId: string): string | undefined {
  const slug = gatewaySlugUrl(providerId);
  if (!slug) return undefined;
  return `${slug}${GATEWAY_PROVIDER_PATHS[providerId] ?? ""}`;
}

/**
 * Where native Gemini `generateContent` should go when the gateway is on.
 *
 * Multimodal turns (images, PDFs) do not use the OpenAI-compatible surface, so
 * without this they keep their hardcoded Google host and never appear in the
 * gateway's telemetry — the attachment turns being exactly the ones worth
 * watching there.
 */
export function gatewayGeminiNativeBaseUrl(): string | undefined {
  // Cloudflare's Google AI Studio native surface is the slug itself; the
  // `/v1/models/{id}:generateContent` suffix is added in nativeGeminiUrl.
  // Appending Google's `/v1beta` here produced
  // `.../google-ai-studio/v1beta/models/...`, which the gateway 401s.
  return gatewaySlugUrl("gemini");
}

/**
 * Workers AI `/run/{model}` address when the gateway is on. Flux lives here,
 * not under the OpenAI-compatible `/v1` the chat models use.
 */
export function gatewayWorkersAiRunUrl(modelId: string): string | undefined {
  const slug = gatewaySlugUrl("cloudflare");
  return slug ? `${slug}/${modelId}` : undefined;
}

function gatewaySlugUrl(providerId: string): string | undefined {
  if (!gatewayEnabled()) return undefined;
  const slug = GATEWAY_PROVIDER_SLUGS[providerId];
  if (!slug) return undefined;
  return `${GATEWAY_URL_PREFIX}v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY}/${slug}`;
}
