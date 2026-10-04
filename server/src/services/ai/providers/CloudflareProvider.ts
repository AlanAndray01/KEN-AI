import { isCloudflareImageModel } from "@Ken/shared";
import { env } from "../../../config/env.js";
import { AppError } from "../../../utils/AppError.js";
import type { GenerateRequest, ProviderModelDescriptor } from "../AIProvider.js";
import { getBuiltInProvider } from "../catalog.js";
import { MODEL_CAPABILITIES, type ModelCapability } from "@Ken/shared";
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
      (new URL(baseUrl).hostname === "gateway.ai.cloudflare.com" && env.CF_ACCOUNT_ID
        ? `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/ai/models/search`
        : super.modelsProbeUrl(baseUrl))
    );
  }

  override async getModels(): Promise<ProviderModelDescriptor[]> {
    const baseUrl = this.credentials.baseUrl?.replace(/\/$/, "");
    if (!baseUrl || ["api.cloudflare.com", "gateway.ai.cloudflare.com"].includes(new URL(baseUrl).hostname)) {
      return super.getModels();
    }
    const response = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${this.credentials.apiKey ?? ""}` },
      redirect: "error", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new AppError("Unable to load Cloudflare Worker models. Check the Worker URL and KEN_API_KEY.", {
      statusCode: 503, code: "PROVIDER_UNAVAILABLE", expose: true,
    });
    const payload = await response.json() as { data?: Array<{ id?: string; name?: string;
      capabilities?: string[]; context_window?: number }> };
    if (!Array.isArray(payload.data)) throw new AppError("The Worker returned an invalid model list.", {
      statusCode: 502, code: "PROVIDER_ERROR",
    });
    return payload.data.flatMap((model) => {
      if (typeof model.id !== "string") return [];
      const known = getBuiltInProvider("cloudflare")?.models.find((item) => item.id === model.id);
      const capabilities = model.capabilities?.filter((cap): cap is ModelCapability =>
        (MODEL_CAPABILITIES as readonly string[]).includes(cap)) ?? known?.capabilities;
      if (!capabilities?.length) return [];
      return [{ id: model.id, name: model.name ?? known?.name ?? model.id, capabilities,
        ...(model.context_window && Number.isFinite(model.context_window) && model.context_window > 0
          ? { contextWindow: model.context_window } : known?.contextWindow ? { contextWindow: known.contextWindow } : {}),
      }];
    });
  }
}

function assertCloudflareChatModel(modelId: string): void {
  if (!isCloudflareImageModel(modelId)) return;
  throw new AppError("That model generates images, not chat. Pick it from the model list or use Auto on a picture request.", {
    statusCode: 400,
    code: "MODEL_UNAVAILABLE",
    expose: true,
  });
}
