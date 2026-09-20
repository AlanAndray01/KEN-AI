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
 * Cloudflare's own models are deliberately absent. They already run on
 * Cloudflare infrastructure and report into the Workers AI dashboard, their
 * direct endpoint is verified working, and the gateway addresses Workers AI on
 * a different path shape than the OpenAI-compatible one every other provider
 * here uses — so routing them through it would add a hop and a failure mode for
 * no gain.
 */
const GATEWAY_PROVIDER_SLUGS: Readonly<Record<string, string>> = {
  groq: "groq",
  gemini: "google-ai-studio",
  openrouter: "openrouter",
  openai: "openai",
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
  return Boolean(env.CF_AI_GATEWAY_TOKEN && env.CF_ACCOUNT_ID);
}

/**
 * Where a provider's requests should go when the gateway is switched on.
 *
 * Returns undefined for a provider the gateway has no slug for, which leaves it
 * on its direct endpoint rather than guessing at a path.
 */
export function gatewayBaseUrl(providerId: string): string | undefined {
  if (!gatewayEnabled()) return undefined;
  const slug = GATEWAY_PROVIDER_SLUGS[providerId];
  if (!slug) return undefined;
  return `${GATEWAY_URL_PREFIX}v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY}/${slug}`;
}
