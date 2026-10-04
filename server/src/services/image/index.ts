import { CLOUDFLARE_IMAGE_MODEL_ID, GEMINI_IMAGE_MODEL_ID } from "@Ken/shared";
import { env } from "../../config/env.js";
import { gatewayWorkersAiRunUrl } from "../ai/aiGateway.js";
import { workerGeminiNativeBaseUrl } from "../ai/workerRouting.js";
import { CloudflareImageProvider } from "./CloudflareImageProvider.js";
import { FailoverImageProvider } from "./failoverImageProvider.js";
import { GeminiImageProvider } from "./GeminiImageProvider.js";
import type { ImageGenerationProvider } from "./ImageGenerationProvider.js";
import { OpenAIImageProvider } from "./OpenAIImageProvider.js";
import { UnconfiguredImageProvider } from "./UnconfiguredImageProvider.js";

export type ImageGenerationBackend = "openai" | "gemini" | "cloudflare" | "none";

/**
 * Pick the image-tool backend. An explicit choice is always honoured, so
 * openai stays on DALL·E and cloudflare stays on Flux even when another key is
 * present.
 *
 * The implicit order leads with Gemini rather than Cloudflare so that adding
 * Flux does not silently move existing deployments off the backend they are
 * already generating with; reaching Flux is a deliberate
 * IMAGE_GENERATION_PROVIDER=cloudflare.
 */
export function resolveImageGenerationBackend(input: {
  provider?: "openai" | "gemini" | "cloudflare";
  openaiKey?: string;
  geminiKey?: string;
  cloudflare?: { accountId?: string; apiToken?: string };
}): ImageGenerationBackend {
  const cloudflareReady = Boolean(input.cloudflare?.accountId && input.cloudflare.apiToken);
  if (input.provider === "openai" && input.openaiKey) return "openai";
  if (input.provider === "gemini" && input.geminiKey) return "gemini";
  if (input.provider === "cloudflare" && cloudflareReady) return "cloudflare";
  if (input.provider) return "none";
  if (input.geminiKey) return "gemini";
  if (cloudflareReady) return "cloudflare";
  if (input.openaiKey) return "openai";
  return "none";
}

export function createImageGenerationProvider(): ImageGenerationProvider {
  const openaiKey = env.IMAGE_GENERATION_API_KEY ?? env.OPENAI_API_KEY;
  const geminiKey = env.CLOUDFLARE_WORKER_URL ? env.KEN_API_KEY : env.GEMINI_API_KEY;
  const accountId = env.CLOUDFLARE_WORKER_URL ? "worker" : env.CF_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_WORKER_URL ? env.KEN_API_KEY : env.CF_TOKEN;
  const backend = resolveImageGenerationBackend({
    ...(env.IMAGE_GENERATION_PROVIDER ? { provider: env.IMAGE_GENERATION_PROVIDER } : {}),
    ...(openaiKey ? { openaiKey } : {}),
    ...(geminiKey ? { geminiKey } : {}),
    cloudflare: { ...(accountId ? { accountId } : {}), ...(apiToken ? { apiToken } : {}) },
  });
  const cloudflare =
    accountId && apiToken
      ? new CloudflareImageProvider(accountId, apiToken, cloudflareRunOptions())
      : undefined;
  const workerGemini = workerGeminiNativeBaseUrl();
  const gemini = geminiKey ? new GeminiImageProvider(geminiKey,
    workerGemini ? { runUrl: `${workerGemini}/models/${GEMINI_IMAGE_MODEL_ID}:generateContent` } : {}) : undefined;
  const openai = openaiKey ? new OpenAIImageProvider(openaiKey) : undefined;
  const primary =
    backend === "openai" ? openai : backend === "gemini" ? gemini : backend === "cloudflare" ? cloudflare : undefined;
  const candidates: ImageGenerationProvider[] = [];
  if (primary) candidates.push(primary);
  for (const provider of [cloudflare, gemini, openai]) {
    if (provider && !candidates.includes(provider)) candidates.push(provider);
  }
  if (candidates.length === 0) return new UnconfiguredImageProvider();
  return new FailoverImageProvider(candidates);
}

function cloudflareRunOptions(): {
  runUrlFor?: (modelId: string) => string | undefined;
  gatewayToken?: string;
} {
  if (env.CLOUDFLARE_WORKER_URL) {
    return { runUrlFor: (modelId) => `${env.CLOUDFLARE_WORKER_URL!.replace(/\/v1$/, "")}/ai/run/${modelId}` };
  }
  // Probe with the default model: the gateway is either on for every model or none.
  const gatewayOn = Boolean(gatewayWorkersAiRunUrl(CLOUDFLARE_IMAGE_MODEL_ID));
  return {
    ...(gatewayOn ? { runUrlFor: (modelId: string) => gatewayWorkersAiRunUrl(modelId) } : {}),
    ...(gatewayOn && env.CF_AI_GATEWAY_TOKEN ? { gatewayToken: env.CF_AI_GATEWAY_TOKEN } : {}),
  };
}

export const imageGenerationProvider: ImageGenerationProvider = createImageGenerationProvider();
