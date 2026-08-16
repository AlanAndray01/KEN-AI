import { AppError } from "../../utils/AppError.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly id = "openai";

  constructor(private readonly apiKey: string) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  unavailableReason(): string {
    return "Image generation is not configured. Set IMAGE_GENERATION_API_KEY or OPENAI_API_KEY.";
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: request.prompt,
        size: "1024x1024",
        n: 1,
        response_format: "b64_json",
      }),
    });
    if (!response.ok) {
      throw new AppError("Image generation provider request failed", {
        statusCode: 502,
        code: "IMAGE_GENERATION_PROVIDER_ERROR",
      });
    }
    const body = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const item = body.data?.[0];
    if (item?.b64_json) {
      return {
        mimeType: "image/png",
        buffer: Buffer.from(item.b64_json, "base64"),
        prompt: request.prompt,
      };
    }
    if (item?.url) {
      const image = await fetch(item.url);
      if (!image.ok) {
        throw new AppError("Image generation provider request failed", {
          statusCode: 502,
          code: "IMAGE_GENERATION_PROVIDER_ERROR",
        });
      }
      return {
        mimeType: image.headers.get("content-type") || "image/png",
        buffer: Buffer.from(await image.arrayBuffer()),
        prompt: request.prompt,
      };
    }
    throw new AppError("Image generation provider returned no image", {
      statusCode: 502,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
    });
  }
}
