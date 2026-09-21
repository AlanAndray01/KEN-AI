import { afterEach, describe, expect, it, vi } from "vitest";
import { CLOUDFLARE_IMAGE_MODEL_ID, GEMINI_IMAGE_MODEL_ID } from "@Ken/shared";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";
import { clearModelSkips, isProviderBlocked, peekModelSkip, rememberModelSkip } from "../ai/modelSkip.js";
import { FailoverImageProvider, shouldTryNextImageBackend } from "./failoverImageProvider.js";
import type { GeneratedImage, ImageGenerationProvider, ImageGenerationRequest } from "./ImageGenerationProvider.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function stub(
  id: string,
  generate: (request: ImageGenerationRequest) => Promise<GeneratedImage>,
): ImageGenerationProvider {
  return {
    id,
    isConfigured: () => true,
    unavailableReason: () => "",
    generate,
  };
}

afterEach(() => {
  clearModelSkips();
  vi.restoreAllMocks();
});

describe("shouldTryNextImageBackend", () => {
  it("hops on quota and provider errors, not on a bad prompt", () => {
    expect(
      shouldTryNextImageBackend(
        new AppError("out", { statusCode: 429, code: "IMAGE_GENERATION_PROVIDER_ERROR" }),
      ),
    ).toBe(true);
    expect(shouldTryNextImageBackend(new AppError("prompt", { statusCode: 400, code: "VALIDATION_ERROR" }))).toBe(
      false,
    );
  });
});

describe("FailoverImageProvider", () => {
  it("returns the first backend that produces an image", async () => {
    const info = vi.spyOn(logger, "info");
    const warn = vi.spyOn(logger, "warn");
    const provider = new FailoverImageProvider([
      stub("cloudflare", async () => {
        throw new AppError("Cloudflare Flux is out of its daily Workers AI quota.", {
          statusCode: 429,
          code: "IMAGE_GENERATION_PROVIDER_ERROR",
          extra: { errorClass: "quota_exceeded" },
        });
      }),
      stub("gemini", async (request) => ({ mimeType: "image/jpeg", buffer: JPEG, prompt: request.prompt })),
    ]);
    const image = await provider.generate({ prompt: "a cat", userId: "u1" });
    expect(image.buffer).toEqual(JPEG);
    expect(provider.id).toBe("cloudflare");
    const tagged = [...info.mock.calls, ...warn.mock.calls]
      .map((call) => call[0])
      .filter((fields): fields is Record<string, unknown> => Boolean(fields) && typeof fields === "object" && "event" in fields);
    expect(tagged.map((fields) => fields.event).sort()).toEqual([
      "image_backend_fail",
      "image_backend_ok",
      "model_skip_set",
    ]);
    expect(tagged.find((fields) => fields.event === "image_backend_fail")).toMatchObject({
      backend: "cloudflare",
      hop: true,
      errorClass: "quota_exceeded",
      nextBackend: "gemini",
    });
    expect(tagged.find((fields) => fields.event === "image_backend_ok")).toMatchObject({
      backend: "gemini",
      priorFailures: 1,
    });
    for (const fields of tagged) {
      expect(JSON.parse(JSON.stringify(fields))).toEqual(fields);
    }
  });

  it("does not call a cooled Cloudflare backend on the next generate", async () => {
    rememberModelSkip(
      "cloudflare",
      CLOUDFLARE_IMAGE_MODEL_ID,
      new AppError("quota", {
        statusCode: 429,
        code: "IMAGE_GENERATION_PROVIDER_ERROR",
        extra: { errorClass: "quota_exceeded" },
      }),
    );
    const info = vi.spyOn(logger, "info");
    const cloudflare = vi.fn(async () => {
      throw new Error("should not run");
    });
    const provider = new FailoverImageProvider([
      stub("cloudflare", cloudflare),
      stub("gemini", async (request) => ({ mimeType: "image/jpeg", buffer: JPEG, prompt: request.prompt })),
    ]);
    const image = await provider.generate({ prompt: "a cat", userId: "u1" });
    expect(cloudflare).not.toHaveBeenCalled();
    expect(image.buffer).toEqual(JPEG);
    expect(isProviderBlocked("cloudflare")).toBe(true);
    const skipLog = info.mock.calls
      .map((call) => call[0])
      .find((fields): fields is Record<string, unknown> => Boolean(fields) && typeof fields === "object" && fields.event === "image_backend_skip");
    expect(skipLog).toMatchObject({
      backend: "cloudflare",
      nextBackend: "gemini",
      skipCode: "IMAGE_GENERATION_PROVIDER_ERROR",
    });
    expect(JSON.parse(JSON.stringify(skipLog))).toEqual(skipLog);
  });

  it("does not cool Gemini chat after a Gemini image quota skip", async () => {
    const provider = new FailoverImageProvider([
      stub("gemini", async () => {
        throw new AppError("gemini quota", {
          statusCode: 429,
          code: "IMAGE_GENERATION_PROVIDER_ERROR",
          extra: { errorClass: "quota_exceeded" },
        });
      }),
    ]);
    await expect(provider.generate({ prompt: "a cat", userId: "u1" })).rejects.toMatchObject({ statusCode: 429 });
    expect(isProviderBlocked("gemini")).toBe(false);
    expect(peekModelSkip("gemini", GEMINI_IMAGE_MODEL_ID)).toBeDefined();
  });

  it("collapses two quota failures into one honest error", async () => {
    const provider = new FailoverImageProvider([
      stub("cloudflare", async () => {
        throw new AppError("cf quota", { statusCode: 429, code: "IMAGE_GENERATION_PROVIDER_ERROR" });
      }),
      stub("gemini", async () => {
        throw new AppError("gemini quota", { statusCode: 429, code: "IMAGE_GENERATION_PROVIDER_ERROR" });
      }),
    ]);
    await expect(provider.generate({ prompt: "a cat", userId: "u1" })).rejects.toMatchObject({
      statusCode: 429,
      message: expect.stringContaining("every configured backend"),
    });
  });
});
