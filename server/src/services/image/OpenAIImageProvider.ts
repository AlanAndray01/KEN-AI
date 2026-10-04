import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { redactSensitive } from "../../utils/redact.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";
import { imageRequestSignal } from "./ImageGenerationProvider.js";

const OPENAI_IMAGE_URL = "https://api.openai.com/v1/images/generations";
const OPENAI_IMAGE_MODEL_ID = "dall-e-3";

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly id = "openai";

  constructor(private readonly apiKey: string) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  unavailableReason(): string {
    return "Image generation isn't turned on for this site yet.";
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const signal = imageRequestSignal(request);
    const response = await fetch(OPENAI_IMAGE_URL, {
      signal,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL_ID,
        prompt: request.prompt,
        size: "1024x1024",
        n: 1,
        response_format: "b64_json",
      }),
    });
    const bodyText = await response.text().catch(() => "");
    let body: unknown;
    try {
      body = bodyText ? JSON.parse(bodyText) : undefined;
    } catch {
      body = undefined;
    }
    if (!response.ok) {
      logger.warn(
        {
          status: response.status,
          model: OPENAI_IMAGE_MODEL_ID,
          body: redactSensitive(bodyText).slice(0, 240),
        },
        "openai image generation failed",
      );
      throw openaiHttpError(response.status, body);
    }
    const item = extractOpenAIImage(body);
    if (item?.b64) {
      return {
        mimeType: "image/png",
        buffer: Buffer.from(item.b64, "base64"),
        prompt: request.prompt,
        providerId: this.id,
        modelId: OPENAI_IMAGE_MODEL_ID,
      };
    }
    if (item?.url) {
      return fetchRemoteImage(item.url, request.prompt, signal);
    }
    logger.warn({ status: response.status, model: OPENAI_IMAGE_MODEL_ID }, "openai returned no image bytes");
    throw new AppError("Image generation provider returned no image", {
      statusCode: 502,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
    });
  }
}

async function fetchRemoteImage(url: string, prompt: string, signal: AbortSignal): Promise<GeneratedImage> {
  const image = await fetch(url, { signal });
  if (!image.ok) {
    const body = await image.text().catch(() => "");
    logger.warn(
      {
        status: image.status,
        model: OPENAI_IMAGE_MODEL_ID,
        body: redactSensitive(body).slice(0, 240),
      },
      "openai image URL fetch failed",
    );
    throw new AppError("Image generation provider request failed", {
      statusCode: 502,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
    });
  }
  return {
    mimeType: image.headers.get("content-type") || "image/png",
    buffer: Buffer.from(await image.arrayBuffer()),
    prompt,
    providerId: "openai",
    modelId: OPENAI_IMAGE_MODEL_ID,
  };
}

function openaiHttpError(status: number, body: unknown): AppError {
  const vendor = extractOpenAIError(body);
  if (status === 429 || /insufficient_quota|exceeded your current quota/i.test(vendor ?? "")) {
    return new AppError("OpenAI image generation is out of quota. Wait a bit, or check the OpenAI plan.", {
      statusCode: 429,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
      extra: { httpStatus: 429, errorClass: "quota_exceeded" },
    });
  }
  if (status === 401 || status === 403) {
    return new AppError("OpenAI rejected the image request. Check IMAGE_GENERATION_API_KEY or OPENAI_API_KEY.", {
      statusCode: 502,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
    });
  }
  return new AppError(
    vendor ? `Image generation failed. ${vendor.slice(0, 200)}` : "Image generation provider request failed",
    { statusCode: 502, code: "IMAGE_GENERATION_PROVIDER_ERROR", expose: true },
  );
}

export function extractOpenAIError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const error = (payload as { error?: { message?: string } | string }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return undefined;
}

function extractOpenAIImage(payload: unknown): { b64?: string; url?: string } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = (payload as { data?: Array<{ b64_json?: string; url?: string }> }).data;
  const item = Array.isArray(data) ? data[0] : undefined;
  if (!item) return undefined;
  if (typeof item.b64_json === "string" && item.b64_json) return { b64: item.b64_json };
  if (typeof item.url === "string" && item.url) return { url: item.url };
  return undefined;
}
