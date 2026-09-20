import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_QUALITY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  GEMINI_FLASH_2_MODEL_ID,
  GEMINI_FLASH_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
} from "@Ken/shared";
import { getBuiltInProvider } from "./catalog.js";

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

  it("lists the quality model before the small default, matching fallback priority", () => {
    // Cloudflare only ever runs as the last hop once everything else has
    // failed, so it should prefer the 70B model over the 3B one — this is the
    // order pickConfiguredModel walks in primaryModel.ts.
    const cloudflare = getBuiltInProvider("cloudflare");
    const ids = cloudflare!.models.map((model) => model.id);
    expect(ids.indexOf(CLOUDFLARE_QUALITY_MODEL_ID)).toBeLessThan(ids.indexOf(DEFAULT_CLOUDFLARE_MODEL_ID));
  });
});
