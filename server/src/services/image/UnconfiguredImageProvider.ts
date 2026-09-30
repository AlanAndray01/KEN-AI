import { AppError } from "../../utils/AppError.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";

export class UnconfiguredImageProvider implements ImageGenerationProvider {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  unavailableReason(): string {
    return "Image generation isn't turned on for this site yet.";
  }

  async generate(_request: ImageGenerationRequest): Promise<GeneratedImage> {
    throw new AppError(this.unavailableReason(), {
      statusCode: 503,
      code: "IMAGE_GENERATION_NOT_CONFIGURED",
      expose: true,
    });
  }
}
