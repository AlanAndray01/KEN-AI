import { env } from "../../config/env.js";
import { GeminiImageProvider } from "./GeminiImageProvider.js";
import type { ImageGenerationProvider } from "./ImageGenerationProvider.js";
import { OpenAIImageProvider } from "./OpenAIImageProvider.js";
import { UnconfiguredImageProvider } from "./UnconfiguredImageProvider.js";

export type ImageGenerationBackend = "openai" | "gemini" | "none";

/** Pick the image-tool backend. Explicit openai stays on DALL·E even when Gemini is present. */
export function resolveImageGenerationBackend(input: {
  provider?: "openai" | "gemini";
  openaiKey?: string;
  geminiKey?: string;
}): ImageGenerationBackend {
  if (input.provider === "openai" && input.openaiKey) return "openai";
  if (input.provider === "gemini" && input.geminiKey) return "gemini";
  if (!input.provider && input.geminiKey) return "gemini";
  if (!input.provider && input.openaiKey) return "openai";
  return "none";
}

export function createImageGenerationProvider(): ImageGenerationProvider {
  const openaiKey = env.IMAGE_GENERATION_API_KEY ?? env.OPENAI_API_KEY;
  const geminiKey = env.GEMINI_API_KEY;
  const backend = resolveImageGenerationBackend({
    ...(env.IMAGE_GENERATION_PROVIDER ? { provider: env.IMAGE_GENERATION_PROVIDER } : {}),
    ...(openaiKey ? { openaiKey } : {}),
    ...(geminiKey ? { geminiKey } : {}),
  });
  if (backend === "openai" && openaiKey) return new OpenAIImageProvider(openaiKey);
  if (backend === "gemini" && geminiKey) return new GeminiImageProvider(geminiKey);
  return new UnconfiguredImageProvider();
}

export const imageGenerationProvider: ImageGenerationProvider = createImageGenerationProvider();
