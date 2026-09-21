import { CLOUDFLARE_IMAGE_MODEL_ID } from "@Ken/shared";
import { env } from "../../../config/env.js";
import { AppError } from "../../../utils/AppError.js";
import type { GenerateRequest } from "../AIProvider.js";
import { OpenAICompatibleProvider } from "./OpenAICompatibleProvider.js";
import { cloudflareModelsUrl } from "./cloudflareModels.js";

/**
 * Cloudflare Workers AI.
 *
 * Chat is plain OpenAI-compatible, so everything else is inherited. Only the
 * credential probe differs: Workers AI has no "GET /v1/models" on either the
 * direct host or the AI Gateway slug (both answer 405), and the real catalogue
 * lives on Cloudflare's own REST search path.
 */
export class CloudflareProvider extends OpenAICompatibleProvider {
  override async generate(request: GenerateRequest) {
    assertCloudflareChatModel(request.modelId);
    return super.generate(request);
  }

  override async *stream(request: GenerateRequest) {
    assertCloudflareChatModel(request.modelId);
    yield* super.stream(request);
  }

  protected override modelsProbeUrl(baseUrl: string): string {
    return (
      cloudflareModelsUrl(baseUrl) ??
      (env.CF_ACCOUNT_ID
        ? `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/models/search`
        : super.modelsProbeUrl(baseUrl))
    );
  }
}

function assertCloudflareChatModel(modelId: string): void {
  if (modelId !== CLOUDFLARE_IMAGE_MODEL_ID) return;
  throw new AppError("Flux generates images, not chat. Pick Flux from the model list or use Auto on a picture request.", {
    statusCode: 400,
    code: "MODEL_UNAVAILABLE",
    expose: true,
  });
}
