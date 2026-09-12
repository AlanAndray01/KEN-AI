import { GEMINI_IMAGE_MODEL_ID } from "@Ken/shared";
import { AppError } from "../../utils/AppError.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";

const GEMINI_IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL_ID}:generateContent`;

export class GeminiImageProvider implements ImageGenerationProvider {
  readonly id = "gemini";

  constructor(private readonly apiKey: string) {}

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  unavailableReason(): string {
    return "Image generation is not configured. Set GEMINI_API_KEY or IMAGE_GENERATION_API_KEY.";
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
        generationConfig: { responseModalities: ["IMAGE"] },
      }),
    });
    if (!response.ok) {
      throw new AppError("Image generation provider request failed", {
        statusCode: 502,
        code: "IMAGE_GENERATION_PROVIDER_ERROR",
      });
    }
    const body = (await response.json()) as unknown;
    const image = extractInlineImage(body);
    if (!image) {
      throw new AppError("Image generation provider returned no image", {
        statusCode: 502,
        code: "IMAGE_GENERATION_PROVIDER_ERROR",
      });
    }
    return {
      mimeType: image.mimeType,
      buffer: Buffer.from(image.data, "base64"),
      prompt: request.prompt,
    };
  }
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
