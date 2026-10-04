import { env } from "../../config/env.js";

export const WORKER_PROVIDER_IDS = ["cloudflare", "gemini", "groq", "cerebras", "deepseek"] as const;

/** Worker mode owns the endpoint and credentials, including personal-key calls. */
export function workerProviderBaseUrl(providerId: string): string | undefined {
  if (!env.CLOUDFLARE_WORKER_URL || !(WORKER_PROVIDER_IDS as readonly string[]).includes(providerId)) return undefined;
  const base = env.CLOUDFLARE_WORKER_URL.replace(/\/$/, "");
  return providerId === "cloudflare" ? base : `${base.replace(/\/v1$/, "")}/providers/${providerId}/v1`;
}

export function workerGeminiNativeBaseUrl(): string | undefined {
  return workerProviderBaseUrl("gemini")?.replace(/\/v1$/, "/v1beta");
}
