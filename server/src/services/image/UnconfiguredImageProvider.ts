import { AppError } from "../../utils/AppError.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";

export class UnconfiguredImageProvider implements ImageGenerationProvider {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  unavailableReason(): string {
    return "Image generation is not configured. Set IMAGE_GENERATION_PROVIDER and an API key.";
  }

  async generate(_request: ImageGenerationRequest): Promise<GeneratedImage> {
    throw new AppError(this.unavailableReason(), {
      statusCode: 503,
      code: "IMAGE_GENERATION_NOT_CONFIGURED",
      expose: true,
    });
  }
}
