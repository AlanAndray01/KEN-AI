import { describe, expect, it } from "vitest";
import { CLOUDFLARE_QUALITY_MODEL_ID, DEFAULT_CLOUDFLARE_MODEL_ID } from "@Ken/shared";
import { FREE_FALLBACK_CHAIN, preferredIdsForProvider } from "./primaryModel.js";

describe("Cloudflare fallback ordering", () => {
  it("puts the 70B model ahead of the small default in the free fallback chain", () => {
    // Cloudflare is the last provider in this chain — by the time it runs,
    // every faster option upstream has already failed, so there is nothing
    // left to be fast for. Quality should win.
    const cloudflareHops = FREE_FALLBACK_CHAIN.filter((hop) => hop.providerId === "cloudflare");
    expect(cloudflareHops.map((hop) => hop.modelId)).toEqual([
      CLOUDFLARE_QUALITY_MODEL_ID,
      DEFAULT_CLOUDFLARE_MODEL_ID,
    ]);
  });

  it("is the very last provider in the chain", () => {
    expect(FREE_FALLBACK_CHAIN.at(-1)?.providerId).toBe("cloudflare");
  });

  it("offers the same quality-first order when a Cloudflare turn needs a same-provider hop", () => {
    expect(preferredIdsForProvider("cloudflare")).toEqual([CLOUDFLARE_QUALITY_MODEL_ID, DEFAULT_CLOUDFLARE_MODEL_ID]);
  });
});
