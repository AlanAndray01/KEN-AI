import { GEMINI_IMAGE_MODEL_ID } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { redactSensitive } from "../../utils/redact.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";

const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL_ID}:generateContent`;

export class GeminiImageProvider implements ImageGenerationProvider {
  readonly id = "gemini";

  constructor(private readonly apiKey: string) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  unavailableReason(): string {
    return "Image generation isn't turned on for this site yet.";
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const response = await fetch(GEMINI_IMAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        // IMAGE-only is accepted by the model, but Google's image-generation
        // docs ship TEXT+IMAGE. Using that pair avoids a 400 on some revisions
        // while still returning an inline image part.
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
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
          model: GEMINI_IMAGE_MODEL_ID,
          body: redactSensitive(bodyText).slice(0, 240),
        },
        "gemini image generation failed",
      );
      throw geminiHttpError(response.status, body);
    }
    const image = extractInlineImage(body);
    if (!image) {
      logger.warn({ status: response.status, model: GEMINI_IMAGE_MODEL_ID }, "gemini returned no image bytes");
      throw new AppError("Image generation provider returned no image", {
        statusCode: 502,
        code: "IMAGE_GENERATION_PROVIDER_ERROR",
        expose: true,
      });
    }
    return {
      mimeType: image.mimeType,
      buffer: Buffer.from(image.data, "base64"),
      prompt: request.prompt,
    };
  }
}

function geminiHttpError(status: number, body: unknown): AppError {
  const vendor = extractGeminiError(body);
  if (status === 429 || /resource.?exhausted|exceeded your current quota/i.test(vendor ?? "")) {
    return new AppError("Gemini image generation is out of quota. Wait a bit, or check the Gemini plan.", {
      statusCode: 429,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
      extra: { httpStatus: 429, errorClass: "quota_exceeded" },
    });
  }
  if (status === 401 || status === 403) {
    return new AppError("Gemini rejected the image request. Check GEMINI_API_KEY.", {
      statusCode: 502,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
    });
  }
  return new AppError(vendor ? `Image generation failed. ${vendor.slice(0, 200)}` : "Image generation provider request failed", {
    statusCode: 502,
    code: "IMAGE_GENERATION_PROVIDER_ERROR",
    expose: true,
  });
}

function extractGeminiError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const error = (payload as { error?: { message?: string } | string }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return undefined;
}

export function extractInlineImage(payload: unknown): { mimeType: string; data: string } | undefined {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const candidates = Array.isArray(root.candidates) ? root.candidates : [];
  const first = candidates[0] && typeof candidates[0] === "object" ? (candidates[0] as Record<string, unknown>) : {};
  const content = first.content && typeof first.content === "object" ? (first.content as Record<string, unknown>) : {};
  const parts = Array.isArray(content.parts) ? content.parts : [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const record = part as Record<string, unknown>;
    const inline = (record.inlineData ?? record.inline_data) as Record<string, unknown> | undefined;
    if (!inline || typeof inline.data !== "string" || !inline.data) continue;
    const mimeType =
      (typeof inline.mimeType === "string" && inline.mimeType) ||
      (typeof inline.mime_type === "string" && inline.mime_type) ||
      "image/png";
    return { mimeType, data: inline.data };
  }
  return undefined;
}
