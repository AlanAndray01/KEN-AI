import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_IMAGE_MODEL_ID,
  CLOUDFLARE_IMAGE_MODEL_IDS,
  isCloudflareImageModel,
  CLOUDFLARE_QUALITY_MODEL_ID,
  CLOUDFLARE_TINY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  GEMINI_FLASH_2_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
} from "@Ken/shared";
import { getBuiltInProvider } from "./catalog.js";

describe("current vendor catalog", () => {
  it("uses the Cerebras and DeepSeek IDs advertised by authenticated discovery", () => {
    expect(getBuiltInProvider("cerebras")!.models.map((model) => model.id)).toEqual(["qwen-3.8-27b", "gpt-oss-120b"]);
    expect(getBuiltInProvider("deepseek")!.models.map((model) => model.id)).toEqual(["deepseek-flash", "deepseek-v4-pro"]);
  });
});

describe("Gemini catalog", () => {
  it("lists official AI Studio chat models with vision and files", () => {
    const gemini = getBuiltInProvider("gemini");
    expect(gemini).toBeDefined();
    const ids = gemini!.models.map((model) => model.id);
    expect(ids).toEqual([
      DEFAULT_GEMINI_MODEL_ID,
      GEMINI_FLASH_MODEL_ID,
      GEMINI_FLASH_2_MODEL_ID,
      GEMINI_PRO_MODEL_ID,
    ]);
    expect(ids).not.toContain("gemini-1.5-flash");
    expect(ids).not.toContain("gemini-1.5-pro");
    expect(ids).not.toContain("gemini-3.1-flash-image");
    for (const model of gemini!.models) {
      expect(model.capabilities).toEqual(expect.arrayContaining(["vision", "files", "text", "streaming"]));
      expect(model.contextWindow).toBe(1_000_000);
    }
  });
});

describe("Cloudflare catalog", () => {
  it("gives each model its own real context window, not one shared placeholder", () => {
    // These three differ by nearly 5x — verified live against the API, not
    // copied from the same "128000" every Cloudflare model used to share.
    // withProviderContextFit and cloudflareMaxTokens both read this value per
    // model, so a wrong number here silently reintroduces the 400 they exist
    // to prevent.
    const cloudflare = getBuiltInProvider("cloudflare");
    expect(cloudflare).toBeDefined();
    const byId = new Map(cloudflare!.models.map((model) => [model.id, model]));
    expect(byId.get(CLOUDFLARE_QUALITY_MODEL_ID)?.contextWindow).toBe(24_000);
    expect(byId.get(DEFAULT_CLOUDFLARE_MODEL_ID)?.contextWindow).toBe(80_000);
    expect(byId.get(CLOUDFLARE_VISION_MODEL_ID)?.contextWindow).toBe(131_000);
  });

  it("exposes the Workers AI chat models that answered 200 on this account", () => {
    // Paid-plan and agreement-gated ids were verified 403 live and must stay
    // out of the picker — listing them is how a click becomes an immediate fail.
    const ids = getBuiltInProvider("cloudflare")!.models.map((model) => model.id);
    expect(ids).toEqual(expect.arrayContaining([
      "@cf/openai/gpt-oss-120b",
      "@cf/qwen/qwen2.5-coder-32b-instruct",
      "@cf/google/gemma-4-26b-a4b-it",
    ]));
    expect(ids).not.toContain("@cf/moonshotai/kimi-k2.6");
    expect(ids).not.toContain("@cf/qwen/qwen3.8-27b");
    expect(ids).not.toContain("@cf/zai-org/glm-5.3");
    expect(ids).toContain(CLOUDFLARE_IMAGE_MODEL_ID);
    expect(getBuiltInProvider("cloudflare")!.models.find((model) => model.id === CLOUDFLARE_IMAGE_MODEL_ID)?.capabilities).toEqual([
      "imageGeneration",
    ]);
  });

  it("lists the quality model before the small default, matching fallback priority", () => {
    // Cloudflare only ever runs as the last hop once everything else has
    // failed. The picker still lists 70B first so a manual choice can pick
    // quality; automatic fallback is the cheap 3B/1B pair (primaryModel.ts).
    const cloudflare = getBuiltInProvider("cloudflare");
    const ids = cloudflare!.models.map((model) => model.id);
    expect(ids.indexOf(CLOUDFLARE_QUALITY_MODEL_ID)).toBeLessThan(ids.indexOf(DEFAULT_CLOUDFLARE_MODEL_ID));
  });

  it("tags Scout with vision and leaves text-only Llama tiers without it", () => {
    const cloudflare = getBuiltInProvider("cloudflare");
    const byId = new Map(cloudflare!.models.map((model) => [model.id, model]));
    expect(byId.get(CLOUDFLARE_VISION_MODEL_ID)?.capabilities).toEqual(
      expect.arrayContaining(["text", "vision", "streaming"]),
    );
    expect(byId.get(DEFAULT_CLOUDFLARE_MODEL_ID)?.capabilities).not.toContain("vision");
  });

  it("keeps every live-traffic Cloudflare id in the catalog, once", () => {
    const ids = getBuiltInProvider("cloudflare")!.models.map((model) => model.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        CLOUDFLARE_QUALITY_MODEL_ID,
        DEFAULT_CLOUDFLARE_MODEL_ID,
        CLOUDFLARE_TINY_MODEL_ID,
        CLOUDFLARE_VISION_MODEL_ID,
        CLOUDFLARE_IMAGE_MODEL_ID,
      ]),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not list embeddings, image models, or agreement-gated vision as chat ids", () => {
    const models = getBuiltInProvider("cloudflare")!.models;
    const ids = models.map((model) => model.id);
    expect(ids).not.toContain("@cf/baai/bge-small-en-v1.5");
    expect(ids).not.toContain("@cf/meta/llama-3.2-11b-vision-instruct");
    // SDXL is listed, but only as an image model.
    const sdxl = models.find((model) => model.id === "@cf/stabilityai/stable-diffusion-xl-base-1.0");
    expect(sdxl?.capabilities).toEqual(["imageGeneration"]);
  });

  it("lists every Cloudflare image model as image-only, and nothing else as image-only", () => {
    const models = getBuiltInProvider("cloudflare")!.models;
    const imageOnly = models.filter((model) => model.capabilities.includes("imageGeneration")).map((model) => model.id);
    expect(imageOnly.sort()).toEqual([...CLOUDFLARE_IMAGE_MODEL_IDS].sort());
    for (const model of models.filter((item) => isCloudflareImageModel(item.id))) {
      expect(model.capabilities).toEqual(["imageGeneration"]);
    }
  });

  it("sends Flux through image generation only, never as a /chat/completions id", () => {
    const flux = getBuiltInProvider("cloudflare")!.models.find((model) => model.id === CLOUDFLARE_IMAGE_MODEL_ID);
    expect(flux?.capabilities).toEqual(["imageGeneration"]);
    expect(flux?.capabilities).not.toContain("text");
  });
});

describe("OpenAI and OpenRouter catalog", () => {
  it("marks GPT-4o variants as vision and file capable", () => {
    const openai = getBuiltInProvider("openai");
    for (const model of openai!.models) {
      expect(model.capabilities).toEqual(expect.arrayContaining(["vision", "files"]));
    }
  });

  it("marks OpenRouter GPT-4o mini as vision-capable so image_url is allowed", () => {
    const openrouter = getBuiltInProvider("openrouter");
    const mini = openrouter!.models.find((model) => model.id === "openai/gpt-4o-mini");
    expect(mini?.capabilities).toEqual(expect.arrayContaining(["vision"]));
  });
});
