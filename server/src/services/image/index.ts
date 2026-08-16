import { env } from "../../config/env.js";
import type { ImageGenerationProvider } from "./ImageGenerationProvider.js";
import { OpenAIImageProvider } from "./OpenAIImageProvider.js";
import { UnconfiguredImageProvider } from "./UnconfiguredImageProvider.js";

export function createImageGenerationProvider(): ImageGenerationProvider {
  const key = env.IMAGE_GENERATION_API_KEY ?? env.OPENAI_API_KEY;
  if (env.IMAGE_GENERATION_PROVIDER === "openai" && key) {
    return new OpenAIImageProvider(key);
  }
  return new UnconfiguredImageProvider();
}

export const imageGenerationProvider: ImageGenerationProvider = createImageGenerationProvider();
