import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../utils/AppError.js";
import { assertUserEndpoint } from "./ai/endpointPolicy.js";
import { detectImageRequest } from "./chat/imageIntent.js";
import { FailoverImageProvider } from "./image/failoverImageProvider.js";
import type { ImageGenerationProvider, ImageGenerationRequest } from "./image/ImageGenerationProvider.js";
import { LocalDiskStorage } from "./storage/LocalDiskStorage.js";

/**
 * Regression cases for docs/ALL_BUGS_AND_STEP_BY_STEP_FIXES.md. Each block
 * names the finding it pins down; these assert the fixed behaviour, where the
 * audit repro scripts in docs/ demonstrate the original defect.
 */

const GATEWAY_ENV = {
  CF_ACCOUNT_ID: "acct123",
  CF_AI_GATEWAY: "ken",
  CF_AI_GATEWAY_TOKEN: "gateway-secret",
};

async function withEnv<T>(overrides: Record<string, string>, load: () => Promise<T>): Promise<T> {
  vi.resetModules();
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(overrides)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    return await load();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe("R1: user-supplied endpoints never receive platform credentials", () => {
  const approved = "https://api.groq.com/openai/v1";

  it("rejects an arbitrary destination", () => {
    expect(() => assertUserEndpoint("https://attacker.example/v1", approved)).toThrow(
      expect.objectContaining({ code: "PROVIDER_ENDPOINT_NOT_ALLOWED" }),
    );
  });

  it("rejects internal addresses and look-alike hosts", () => {
    for (const url of [
      "http://127.0.0.1:11434/v1",
      "http://169.254.169.254/latest",
      "https://api.groq.com.attacker.example/openai/v1",
      "https://api.groq.com/openai/v1/../../redirect",
    ]) {
      expect(() => assertUserEndpoint(url, approved)).toThrow(AppError);
    }
  });

  it("rejects any custom URL when the administrator approved none", () => {
    expect(() => assertUserEndpoint("https://api.groq.com/openai/v1", undefined)).toThrow(AppError);
  });

  it("accepts the approved endpoint and an omitted one", () => {
    expect(() => assertUserEndpoint(`${approved}/`, approved)).not.toThrow();
    expect(() => assertUserEndpoint(undefined, approved)).not.toThrow();
  });
});

describe("R1/R4: gateway token is bound to the gateway route", () => {
  it("attaches the token only to this installation's gateway URL", async () => {
    const { runtimeCredentials, gatewayBaseUrl } = await withEnv(GATEWAY_ENV, async () => ({
      ...(await import("./ai/endpointPolicy.js")),
      ...(await import("./ai/aiGateway.js")),
    }));
    const gateway = gatewayBaseUrl("groq");
    expect(gateway).toBeDefined();

    expect(runtimeCredentials("groq", { apiKey: "k", baseUrl: gateway ?? "" }).gatewayToken).toBe("gateway-secret");
    // A probe or generation aimed anywhere else never carries it, even when
    // the caller tried to pass one through.
    expect(
      runtimeCredentials("groq", { apiKey: "k", baseUrl: "https://attacker.example/v1", gatewayToken: "x" })
        .gatewayToken,
    ).toBeUndefined();
    expect(runtimeCredentials("groq", { apiKey: "k", baseUrl: "https://api.groq.com/openai/v1" }).gatewayToken)
      .toBeUndefined();
  });
});

describe("R3: native Gemini media follows the configured route", () => {
  it("maps each compat route to its matching native route", async () => {
    const { nativeRouteFor, GEMINI_OPENAI_BASE_URL, gatewayBaseUrl, gatewayGeminiNativeBaseUrl } = await withEnv(
      GATEWAY_ENV,
      async () => ({
        ...(await import("./ai/providers/GeminiProvider.js")),
        ...(await import("./ai/aiGateway.js")),
      }),
    );

    expect(nativeRouteFor(GEMINI_OPENAI_BASE_URL)).toEqual({ kind: "direct" });
    expect(nativeRouteFor(gatewayBaseUrl("gemini"))).toEqual({
      kind: "gateway",
      baseUrl: gatewayGeminiNativeBaseUrl(),
    });
    // Unknown proxies are refused rather than bypassed to Google.
    expect(nativeRouteFor("https://my-worker.example.dev/v1")).toEqual({ kind: "unsupported" });
  });
});

describe("N9: discussion and negation do not generate images", () => {
  it.each([
    "Don't generate an image, just describe a sunset in words",
    "please never draw anything, I only want text",
    "How do I generate an image with the OpenAI API?",
    "explain how to draw a cat step by step",
    "write a function that can draw a circle on canvas",
    'What does the prompt "draw a cat" do in Midjourney?',
    "image mat banao, sirf batao",
  ])("ignores %s", (text) => {
    expect(detectImageRequest(text)).toBe(false);
  });

  it.each(["draw a cat", "generate an image of a sunset", "ek billi ki image banao"])("still catches %s", (text) => {
    expect(detectImageRequest(text)).toBe(true);
  });
});

describe("N11/N12: image failover provenance, pinning and cancellation", () => {
  function fakeProvider(id: string, outcome: "ok" | "fail"): ImageGenerationProvider & { calls: number } {
    const provider = {
      id,
      calls: 0,
      isConfigured: () => true,
      unavailableReason: () => "",
      async generate(request: ImageGenerationRequest) {
        provider.calls += 1;
        if (outcome === "fail") {
          throw new AppError("upstream down", { statusCode: 503, code: "IMAGE_GENERATION_PROVIDER_ERROR" });
        }
        return { mimeType: "image/png", buffer: Buffer.from("png"), prompt: request.prompt };
      },
    };
    return provider;
  }

  it("does not leave a pinned backend for another one", async () => {
    const pinned = fakeProvider("pinned-a", "fail");
    const other = fakeProvider("other-a", "ok");
    const chain = new FailoverImageProvider([pinned, other]);

    await expect(chain.generate({ prompt: "cat", userId: "u", providerId: "pinned-a" })).rejects.toThrow();
    expect(other.calls).toBe(0);
  });

  it("labels a fallback result with the backend that produced it", async () => {
    const first = fakeProvider("first-b", "fail");
    const second = fakeProvider("second-b", "ok");
    const generated = await new FailoverImageProvider([first, second]).generate({ prompt: "cat", userId: "u" });

    expect(generated.providerId).toBe("second-b");
  });

  it("makes no provider call once the attempt is cancelled", async () => {
    const provider = fakeProvider("cancel-c", "ok");
    const controller = new AbortController();
    controller.abort();

    await expect(
      new FailoverImageProvider([provider]).generate({ prompt: "cat", userId: "u", abortSignal: controller.signal }),
    ).rejects.toThrow();
    expect(provider.calls).toBe(0);
  });
});

describe("N14: local deletion only treats absence as success", () => {
  let root: string | undefined;
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("succeeds for a missing object", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "ken-storage-"));
    await expect(new LocalDiskStorage(root).delete("user/missing")).resolves.toBeUndefined();
  });

  it("propagates a failure that leaves bytes behind", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "ken-storage-"));
    // unlink on a directory fails with EISDIR/EPERM, not ENOENT: the stand-in
    // for permission and I/O errors that used to be swallowed.
    await mkdir(path.join(root, "user", "blocked"), { recursive: true });
    await expect(new LocalDiskStorage(root).delete("user/blocked")).rejects.toThrow();
  });
});
