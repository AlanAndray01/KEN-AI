import { CLOUDFLARE_IMAGE_MODEL_ID, isCloudflareImageModel } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { redactSensitive } from "../../utils/redact.js";
import { GATEWAY_URL_PREFIX } from "../ai/aiGateway.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";
import { imageRequestSignal } from "./ImageGenerationProvider.js";

/**
 * Text-to-image on Cloudflare Workers AI (Flux, Stable Diffusion, Leonardo).
 *
 * Runs on the same CF_TOKEN and account as the Cloudflare chat models, so it
 * needs no credential of its own. Addressed through Workers AI's own /ai/run
 * path rather than the OpenAI-compatible one, which only serves chat and
 * embeddings.
 *
 * The models disagree on wire format, per Cloudflare's published schemas and
 * a live generation on each:
 *   - Flux 2 takes multipart/form-data; everything else takes JSON.
 *   - Flux and Lucid Origin answer JSON with a base64 image; Stable Diffusion,
 *     DreamShaper and Phoenix answer raw image bytes. The Content-Type on those
 *     bytes is not trustworthy (SDXL Lightning labels JPEG as PNG), so the
 *     media type is always read from the bytes.
 */
const MULTIPART_MODELS = new Set([
  "@cf/black-forest-labs/flux-2-klein-4b",
  "@cf/black-forest-labs/flux-2-klein-9b",
  "@cf/black-forest-labs/flux-2-dev",
]);

/** Flux 2 has no implicit size on the multipart surface; Schnell's default is 1024. */
const MULTIPART_SIZE = "1024";

export class CloudflareImageProvider implements ImageGenerationProvider {
  readonly id = "cloudflare";

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly options: {
      /** Gateway run URL for the default model (legacy single-model option). */
      runUrl?: string;
      /** Gateway run URL for any model; preferred over `runUrl`. */
      runUrlFor?: (modelId: string) => string | undefined;
      gatewayToken?: string;
    } = {},
  ) {}

  isConfigured(): boolean {
    return this.accountId.length > 0 && this.apiToken.length > 0;
  }

  unavailableReason(): string {
    return "Image generation isn't turned on for this site yet.";
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const modelId = request.modelId ?? CLOUDFLARE_IMAGE_MODEL_ID;
    if (!isCloudflareImageModel(modelId)) {
      throw new AppError("That image model isn't available. Choose another image model.", {
        statusCode: 400,
        code: "IMAGE_MODEL_UNAVAILABLE",
        expose: true,
      });
    }
    const url =
      this.options.runUrlFor?.(modelId) ??
      (modelId === CLOUDFLARE_IMAGE_MODEL_ID ? this.options.runUrl : undefined) ??
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${modelId}`;
    // An authenticated gateway 401s at its own front door. Hitting that URL
    // without the header is a configuration bug, not a Flux failure.
    if (url.startsWith(GATEWAY_URL_PREFIX) && !this.options.gatewayToken) {
      throw new AppError(
        "Image generation is temporarily unavailable. Try again later.",
        { statusCode: 503, code: "IMAGE_GENERATION_NOT_CONFIGURED", expose: true },
      );
    }
    const response = await fetch(url, {
      signal: imageRequestSignal(request),
      method: "POST",
      headers: {
        // A FormData body sets its own multipart boundary header.
        ...(MULTIPART_MODELS.has(modelId) ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${this.apiToken}`,
        ...(this.options.gatewayToken ? { "cf-aig-authorization": `Bearer ${this.options.gatewayToken}` } : {}),
      },
      body: requestBody(modelId, request.prompt),
    });
    if (!response.ok) {
      throw await fluxHttpError(response, modelId);
    }

    const image = await readImage(response, modelId);
    return { mimeType: image.mimeType, buffer: image.buffer, prompt: request.prompt, providerId: this.id, modelId };
  }
}

function requestBody(modelId: string, prompt: string): FormData | string {
  if (MULTIPART_MODELS.has(modelId)) {
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("width", MULTIPART_SIZE);
    form.append("height", MULTIPART_SIZE);
    return form;
  }
  // Schnell's `steps` is documented (default 4, max 8); the other JSON models
  // run on their own defaults.
  return JSON.stringify(modelId === CLOUDFLARE_IMAGE_MODEL_ID ? { prompt, steps: 4 } : { prompt });
}

function unreadable(modelId: string, status: number, reason: string): AppError {
  logger.warn({ status, model: modelId }, reason);
  return new AppError("Image generation provider returned no image", {
    statusCode: 502,
    code: "IMAGE_GENERATION_PROVIDER_ERROR",
    expose: true,
  });
}

/**
 * Decided from the bytes, not the Content-Type: raw image bytes are the image,
 * anything else must be a JSON envelope carrying base64 (or an error). Headers
 * are unreliable in both directions here, including through the gateway.
 */
async function readImage(response: Response, modelId: string): Promise<{ mimeType: string; buffer: Buffer }> {
  const buffer = Buffer.from(await response.arrayBuffer());
  const rawType = sniffKnownImage(buffer);
  if (rawType) return { mimeType: rawType, buffer };

  let payload: unknown;
  try {
    payload = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw unreadable(modelId, response.status, "image model returned neither an image nor JSON");
  }
  const payloadError = fluxSuccessError(payload);
  if (payloadError) throw payloadError;
  const image = extractFluxImage(payload);
  if (!image) throw unreadable(modelId, response.status, "image model returned no image bytes");
  return image;
}

async function fluxHttpError(response: Response, modelId: string = CLOUDFLARE_IMAGE_MODEL_ID): Promise<AppError> {
  const bodyText = await response.text().catch(() => "");
  logger.warn(
    {
      status: response.status,
      model: modelId,
      body: redactSensitive(bodyText).slice(0, 240),
    },
    "cloudflare image generation failed",
  );
  let parsed: unknown;
  try {
    parsed = bodyText ? JSON.parse(bodyText) : undefined;
  } catch {
    parsed = undefined;
  }
  return fluxAppError(response.status, extractCloudflareAiError(parsed), bodyText);
}

function fluxSuccessError(payload: unknown): AppError | undefined {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const extracted = extractCloudflareAiError(payload);
  if (root.success === false) {
    return fluxAppError(isNeuronQuota(extracted) ? 429 : 502, extracted);
  }
  if (isNeuronQuota(extracted)) {
    return fluxAppError(429, extracted);
  }
  return undefined;
}

function fluxAppError(
  status: number,
  extracted: { code?: string; message?: string } | undefined,
  bodyText = "",
): AppError {
  if (status === 401 || status === 403) {
    return new AppError("Cloudflare rejected the image request. Check CF_TOKEN and CF_AI_GATEWAY_TOKEN.", {
      statusCode: 502,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
    });
  }
  if (isNeuronQuota(extracted)) {
    return new AppError(
      "Cloudflare image generation is out of its daily Workers AI quota. Wait until it resets, or upgrade the Workers plan.",
      {
        statusCode: 429,
        code: "IMAGE_GENERATION_PROVIDER_ERROR",
        expose: true,
        extra: {
          httpStatus: 429,
          errorClass: "quota_exceeded",
          ...(extracted?.code ? { providerCode: extracted.code } : {}),
        },
      },
    );
  }
  if (status === 429) {
    return new AppError("Cloudflare image generation is rate-limited. Try again in a moment.", {
      statusCode: 429,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
      extra: { httpStatus: 429 },
    });
  }
  const vendor = cleanCloudflareMessage(extracted?.message ?? bodyText);
  if (vendor) {
    return new AppError(`Image generation failed. ${vendor.slice(0, 200)}`, {
      statusCode: status >= 400 && status < 600 ? status : 502,
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      expose: true,
    });
  }
  return new AppError("Image generation failed. Cloudflare returned an error.", {
    statusCode: 502,
    code: "IMAGE_GENERATION_PROVIDER_ERROR",
    expose: true,
  });
}

export function extractCloudflareAiError(
  payload: unknown,
): { code?: string; message?: string } | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as {
    error?: { message?: string; code?: string | number } | string;
    errors?: Array<{ message?: string; code?: string | number }>;
  };
  if (typeof record.error === "string" && record.error.trim()) {
    return { message: record.error };
  }
  if (record.error && typeof record.error === "object" && record.error.message) {
    return {
      message: record.error.message,
      ...(record.error.code !== undefined ? { code: String(record.error.code) } : {}),
    };
  }
  const first = record.errors?.find((entry) => entry && (entry.message || entry.code !== undefined));
  if (!first) return undefined;
  return {
    ...(first.message ? { message: first.message } : {}),
    ...(first.code !== undefined ? { code: String(first.code) } : {}),
  };
}

function isNeuronQuota(extracted: { code?: string; message?: string } | undefined): boolean {
  if (extracted?.code === "4006" || extracted?.code === "quota_exceeded") return true;
  return /neurons|daily free allocation/i.test(extracted?.message ?? "");
}

function cleanCloudflareMessage(message: string): string {
  const cleaned = message.replace(/^AiError:\s*(?:AiError:\s*)?/i, "").replace(/\s+/g, " ").trim();
  if (!cleaned || cleaned === "{}" || cleaned === "[]") return "";
  return cleaned;
}

/**
 * Workers AI returns the image as base64 under `result.image`, with no media
 * type anywhere in the response — so it is read off the bytes rather than
 * assumed. Schnell currently answers JPEG despite the format being documented
 * loosely enough that it could change. The gateway sometimes unwraps `result`
 * or wraps it again, and a data-URI prefix has shown up on the same field.
 */
export function extractFluxImage(payload: unknown): { mimeType: string; buffer: Buffer } | undefined {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const result = root.result && typeof root.result === "object" ? (root.result as Record<string, unknown>) : {};
  const nested = result.result && typeof result.result === "object" ? (result.result as Record<string, unknown>) : {};
  const raw = [result.image, root.image, nested.image].find(
    (value) => typeof value === "string" && value.length > 0,
  );
  if (typeof raw !== "string") return undefined;

  const marker = "base64,";
  const base64 = raw.includes(marker) ? raw.slice(raw.indexOf(marker) + marker.length) : raw;
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) return undefined;
  return { mimeType: sniffImageMimeType(buffer), buffer };
}

function sniffImageMimeType(buffer: Buffer): string {
  return sniffKnownImage(buffer) ?? "image/jpeg";
}

/** JPEG, PNG or WebP from the magic bytes; undefined for anything else (an HTML error page, say). */
function sniffKnownImage(buffer: Buffer): string | undefined {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return undefined;
}
