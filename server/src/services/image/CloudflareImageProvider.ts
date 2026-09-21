import { CLOUDFLARE_IMAGE_MODEL_ID } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { redactSensitive } from "../../utils/redact.js";
import { GATEWAY_URL_PREFIX } from "../ai/aiGateway.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";

/**
 * Flux on Cloudflare Workers AI.
 *
 * Runs on the same CF_TOKEN and account as the Cloudflare chat models, so it
 * needs no credential of its own. Addressed through Workers AI's own /ai/run
 * path rather than the OpenAI-compatible one, which only serves chat and
 * embeddings. Posting Flux to `/chat/completions` 400s: the model schema is
 * `{ prompt, steps }`, not `{ messages }`.
 */
export class CloudflareImageProvider implements ImageGenerationProvider {
  readonly id = "cloudflare";

  constructor(
    private readonly accountId: string,
    private readonly apiToken: string,
    private readonly options: { runUrl?: string; gatewayToken?: string } = {},
  ) {}

  isConfigured(): boolean {
    return this.accountId.length > 0 && this.apiToken.length > 0;
  }

  unavailableReason(): string {
    return "Image generation is not configured. Set CF_ACCOUNT_ID and CF_TOKEN, or a Gemini/OpenAI key.";
  }

  async generate(request: ImageGenerationRequest): Promise<GeneratedImage> {
    const url =
      this.options.runUrl ??
      `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run/${CLOUDFLARE_IMAGE_MODEL_ID}`;
    // An authenticated gateway 401s at its own front door. Hitting that URL
    // without the header is a configuration bug, not a Flux failure.
    if (url.startsWith(GATEWAY_URL_PREFIX) && !this.options.gatewayToken) {
      throw new AppError(
        "Image generation is missing the AI Gateway token. Set CF_AI_GATEWAY_TOKEN.",
        { statusCode: 503, code: "IMAGE_GENERATION_NOT_CONFIGURED", expose: true },
      );
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiToken}`,
        ...(this.options.gatewayToken ? { "cf-aig-authorization": `Bearer ${this.options.gatewayToken}` } : {}),
      },
      // `steps` is the documented field (default 4, max 8). Prompt-only still
      // works, but naming it keeps the body on the published schema.
      body: JSON.stringify({ prompt: request.prompt, steps: 4 }),
    });
    if (!response.ok) {
      throw await fluxHttpError(response);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      logger.warn({ status: response.status, model: CLOUDFLARE_IMAGE_MODEL_ID }, "flux returned non-JSON");
      throw new AppError("Image generation provider returned an unreadable response", {
        statusCode: 502,
        code: "IMAGE_GENERATION_PROVIDER_ERROR",
        expose: true,
      });
    }

    const payloadError = fluxSuccessError(payload);
    if (payloadError) throw payloadError;

    const image = extractFluxImage(payload);
    if (!image) {
      logger.warn({ status: response.status, model: CLOUDFLARE_IMAGE_MODEL_ID }, "flux returned no image bytes");
      throw new AppError("Image generation provider returned no image", {
        statusCode: 502,
        code: "IMAGE_GENERATION_PROVIDER_ERROR",
        expose: true,
      });
    }
    return { mimeType: image.mimeType, buffer: image.buffer, prompt: request.prompt };
  }
}

async function fluxHttpError(response: Response): Promise<AppError> {
  const bodyText = await response.text().catch(() => "");
  logger.warn(
    {
      status: response.status,
      model: CLOUDFLARE_IMAGE_MODEL_ID,
      body: redactSensitive(bodyText).slice(0, 240),
    },
    "flux image generation failed",
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
      "Cloudflare Flux is out of its daily Workers AI quota. Wait until it resets, or upgrade the Workers plan.",
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
  if (extracted?.code === "4006") return true;
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
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  return "image/jpeg";
}
