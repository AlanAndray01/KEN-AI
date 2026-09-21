import { describe, expect, it } from "vitest";
import { CLOUDFLARE_TINY_MODEL_ID, DEFAULT_CLOUDFLARE_MODEL_ID } from "@Ken/shared";
import { FREE_FALLBACK_CHAIN, preferredIdsForProvider } from "./primaryModel.js";

describe("Cloudflare fallback ordering", () => {
  it("puts the cheap 3B and 1B models in the free fallback chain, not 70B", () => {
    const cloudflareHops = FREE_FALLBACK_CHAIN.filter((hop) => hop.providerId === "cloudflare");
    expect(cloudflareHops.map((hop) => hop.modelId)).toEqual([
      DEFAULT_CLOUDFLARE_MODEL_ID,
      CLOUDFLARE_TINY_MODEL_ID,
    ]);
  });

  it("is the very last provider in the chain", () => {
    expect(FREE_FALLBACK_CHAIN.at(-1)?.providerId).toBe("cloudflare");
  });

  it("offers the same quality-first order when a Cloudflare turn needs a same-provider hop", () => {
    expect(preferredIdsForProvider("cloudflare")).toEqual([DEFAULT_CLOUDFLARE_MODEL_ID, CLOUDFLARE_TINY_MODEL_ID]);
  });
});
