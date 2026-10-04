import { CLOUDFLARE_IMAGE_MODEL_ID, GEMINI_IMAGE_MODEL_ID } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { extraString, telemetry } from "../../utils/telemetry.js";
import { isProviderBlocked, peekModelSkip, rememberModelSkip } from "../ai/modelSkip.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";

const OPENAI_IMAGE_MODEL_ID = "dall-e-3";

/**
 * Tries each configured image backend in order. A pinned Flux turn still
 * *starts* on Cloudflare; hopping only happens after that backend actually
 * fails (quota, 5xx, missing image). An empty prompt stays a 400.
 *
 * Cooled-down backends are not called again: Workers AI neurons are
 * account-wide, so a Flux 4006 must not spend another round-trip on the
 * next user turn. Gemini image quota is model-scoped and does not block
 * Gemini chat/vision.
 */
export class FailoverImageProvider implements ImageGenerationProvider {
  readonly id: string;

  constructor(private readonly chain: readonly ImageGenerationProvider[]) {
    this.id = chain[0]?.id ?? "none";
  }

  isConfigured(): boolean {
    return this.chain.some((provider) => provider.isConfigured());
  }

  unavailableReason(): string {
    return this.chain[0]?.unavailableReason() ?? "Image generation is not configured.";
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const deadline = AbortSignal.timeout(120_000);
    request = { ...request, abortSignal: request.abortSignal ? AbortSignal.any([request.abortSignal, deadline]) : deadline };
    const chain = request.providerId ? this.chain.filter((item) => item.id === request.providerId) : this.chain;
    if (chain.length === 0) throw new AppError("Selected image provider is not configured", { statusCode: 503, code: "IMAGE_GENERATION_NOT_CONFIGURED" });
    const errors: AppError[] = [];
    for (let index = 0; index < chain.length; index += 1) {
      request.abortSignal?.throwIfAborted();
      const provider = chain[index];
      if (!provider) continue;
      if (isImageBackendCooling(provider.id)) {
        const skip =
          peekModelSkip(provider.id, imageSkipModelId(provider.id)) ?? peekModelSkip(provider.id, "*");
        logger.info(
          telemetry({
            event: "image_backend_skip",
            backend: provider.id,
            modelId: imageSkipModelId(provider.id),
            skipReason: skip?.reason ?? (isProviderBlocked(provider.id) ? "provider_blocked" : "cooldown"),
            skipCode: skip?.code,
            nextBackend: this.chain[index + 1]?.id,
          }),
          "image backend skipped (cooldown)",
        );
        errors.push(
          new AppError("Image generation backend is in cooldown.", {
            statusCode: 429,
            code: "IMAGE_GENERATION_PROVIDER_ERROR",
            expose: true,
          }),
        );
        continue;
      }
      try {
        const generated = await provider.generate(request);
        logger.info(
          telemetry({
            event: "image_backend_ok",
            backend: provider.id,
            modelId: imageSkipModelId(provider.id),
            priorFailures: errors.length,
          }),
          "image generation succeeded",
        );
        return { ...generated, providerId: generated.providerId ?? provider.id, modelId: generated.modelId ?? imageSkipModelId(provider.id) };
      } catch (error) {
        request.abortSignal?.throwIfAborted();
        if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) throw error;
        const failure =
          error instanceof AppError
            ? error
            : new AppError("Image generation failed", {
                statusCode: 502,
                code: "IMAGE_GENERATION_PROVIDER_ERROR",
                expose: true,
                cause: error,
              });
        errors.push(failure);
        rememberModelSkip(provider.id, imageSkipModelId(provider.id), failure);
        const canHop = index < chain.length - 1 && shouldTryNextImageBackend(error);
        logger.warn(
          telemetry({
            event: "image_backend_fail",
            backend: provider.id,
            modelId: imageSkipModelId(provider.id),
            code: failure.code,
            status: failure.statusCode,
            hop: canHop,
            errorClass: extraString(failure.extra, "errorClass"),
            nextBackend: canHop ? this.chain[index + 1]?.id : undefined,
          }),
          "image generation backend failed",
        );
        if (!canHop) {
          if (index === chain.length - 1) break;
          throw error;
        }
      }
    }
    if (errors.length > 1 && errors.every((error) => error.statusCode === 429)) {
      throw new AppError(
        "Image generation is out of quota on every configured backend. Wait until a provider resets, then retry.",
        { statusCode: 429, code: "IMAGE_GENERATION_PROVIDER_ERROR", expose: true },
      );
    }
    throw errors[errors.length - 1] ?? new AppError("Image generation failed", {
      statusCode: 502,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
    });
  }
}

export function imageSkipModelId(backendId: string): string {
  if (backendId === "cloudflare") return CLOUDFLARE_IMAGE_MODEL_ID;
  if (backendId === "gemini") return GEMINI_IMAGE_MODEL_ID;
  if (backendId === "openai") return OPENAI_IMAGE_MODEL_ID;
  return backendId;
}

export function isImageBackendCooling(backendId: string): boolean {
  return isProviderBlocked(backendId) || Boolean(peekModelSkip(backendId, imageSkipModelId(backendId)));
}

export function shouldTryNextImageBackend(error: unknown): boolean {
  if (!(error instanceof AppError)) return true;
  if (error.code === "VALIDATION_ERROR") return false;
  if (error.statusCode === 429) return true;
  if (error.statusCode === 401 || error.statusCode === 403) return true;
  if (error.code === "IMAGE_GENERATION_NOT_CONFIGURED") return true;
  if (error.code === "IMAGE_GENERATION_PROVIDER_ERROR") return true;
  return error.statusCode >= 500;
}
