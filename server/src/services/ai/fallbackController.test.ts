import { afterEach, describe, expect, it } from "vitest";
import {
  CLOUDFLARE_TINY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
} from "@Ken/shared";
import { AppError } from "../../utils/AppError.js";
import {
  applyRetryAttachmentRoute,
  listRetryHops,
  pickAttachmentHop,
  providersBlockedAfterError,
} from "./fallbackController.js";
import { isProviderLeaveError } from "./fallback.js";
import { clearModelSkips, rememberModelSkip } from "./modelSkip.js";

afterEach(() => {
  clearModelSkips();
});

function model(partial: {
  id: string;
  providerId: string;
  capabilities: Array<"text" | "vision" | "files" | "streaming">;
}) {
  return { name: partial.id, enabled: true, available: true, ...partial };
}

const groq = model({
  id: DEFAULT_GROQ_MODEL_ID,
  providerId: "groq",
  capabilities: ["text", "streaming"],
});
const lite = model({
  id: DEFAULT_GEMINI_MODEL_ID,
  providerId: "gemini",
  capabilities: ["text", "vision", "files", "streaming"],
});
const flash = model({
  id: "gemini-3.8-flash",
  providerId: "gemini",
  capabilities: ["text", "vision", "files", "streaming"],
});
const scout = model({
  id: CLOUDFLARE_VISION_MODEL_ID,
  providerId: "cloudflare",
  capabilities: ["text", "vision", "streaming"],
});
const authError = new AppError("That model could not authenticate the request.", {
  statusCode: 502,
  code: "PROVIDER_INVALID_CREDENTIALS",
  extra: { httpStatus: 401 },
});
const imageTurn = {
  providerId: "gemini",
  modelId: lite.id,
  messages: [
    { role: "user" as const, content: "look", parts: [{ type: "inline" as const, mimeType: "image/png", data: "AA" }] },
  ],
};

describe("providersBlockedAfterError", () => {
  it("blocks the whole provider after a vendor 401", () => {
    expect(providersBlockedAfterError({ providerId: "gemini", modelId: lite.id }, authError)).toContain("gemini");
    expect(isProviderLeaveError(authError)).toBe(true);
  });

  it("does not block the provider after a quota error", () => {
    const quota = new AppError("rate", { statusCode: 429, code: "PROVIDER_RATE_LIMITED" });
    expect(isProviderLeaveError(quota)).toBe(false);
    expect(providersBlockedAfterError({ providerId: "gemini", modelId: flash.id }, quota)).not.toContain("gemini");
  });
});

describe("pickAttachmentHop", () => {
  it("will not hop a vision turn back onto a blocked Gemini", () => {
    const picked = pickAttachmentHop(
      [groq, lite, scout],
      { providerId: "groq", modelId: groq.id },
      "vision",
      { blockedProviders: ["gemini"] },
    );
    expect(picked).toMatchObject({ providerId: "cloudflare", modelId: scout.id, rerouted: true });
  });

  it("honours Auto file preferences when they are passed in", () => {
    const openai = model({
      id: "gpt-4o-mini",
      providerId: "openai",
      capabilities: ["text", "vision", "files", "streaming"],
    });
    const picked = pickAttachmentHop([lite, openai], { providerId: "auto", modelId: "auto" }, "files", {
      preferred: [
        { providerId: "openai", modelId: "gpt-4o-mini" },
        { providerId: "gemini", modelId: lite.id },
      ],
    });
    expect(picked).toMatchObject({ providerId: "openai", modelId: "gpt-4o-mini" });
  });
});

describe("applyRetryAttachmentRoute", () => {
  it("keeps a PDF extract hop on Groq instead of bouncing to Gemini", () => {
    const routed = applyRetryAttachmentRoute(
      {
        providerId: "groq",
        modelId: groq.id,
        messages: [
          {
            role: "user",
            content: "summarise",
            parts: [{ type: "inline", mimeType: "application/pdf", data: "JVBERi0" }],
          },
        ],
        blockedProviders: ["gemini"],
      },
      [groq, lite],
    );
    expect(routed).toMatchObject({ providerId: "groq", modelId: groq.id, rerouted: false });
  });

  it("hops a Groq image turn to Scout when Gemini is blocked", () => {
    const routed = applyRetryAttachmentRoute(
      {
        providerId: "groq",
        modelId: groq.id,
        messages: imageTurn.messages,
        blockedProviders: ["gemini"],
      },
      [groq, lite, scout],
    );
    expect(routed.providerId).not.toBe("gemini");
    expect(routed).toMatchObject({ providerId: "cloudflare", modelId: scout.id, rerouted: true });
  });
});

describe("listRetryHops", () => {
  it("skips sibling Gemini models after a 401 and lands on the next distinct provider", () => {
    rememberModelSkip("gemini", lite.id, authError);
    const hops = listRetryHops({
      request: imageTurn,
      error: authError,
      models: [lite, flash, groq, scout],
    });
    expect(hops.every((hop) => hop.providerId !== "gemini")).toBe(true);
    expect(hops[0]).toMatchObject({ providerId: "cloudflare", modelId: scout.id });
  });

  it("still tries Lite after a 3.8 quota error", () => {
    const quota = new AppError("rate", {
      statusCode: 429,
      code: "PROVIDER_RATE_LIMITED",
      extra: { errorClass: "quota_exceeded" },
    });
    const hops = listRetryHops({
      request: { providerId: "gemini", modelId: flash.id, messages: [{ role: "user", content: "hi" }] },
      error: quota,
      models: [flash, lite, groq],
    });
    expect(hops[0]).toMatchObject({ providerId: "gemini", modelId: lite.id });
    expect(hops.some((hop) => hop.providerId === "groq")).toBe(true);
  });

  it("does not hop Cloudflare 3B onto 1B after a neuron-bucket 429", () => {
    const cf3b = model({
      id: DEFAULT_CLOUDFLARE_MODEL_ID,
      providerId: "cloudflare",
      capabilities: ["text", "streaming"],
    });
    const cf1b = model({
      id: CLOUDFLARE_TINY_MODEL_ID,
      providerId: "cloudflare",
      capabilities: ["text", "streaming"],
    });
    const quota = new AppError("Provider rate limit reached.", {
      statusCode: 429,
      code: "PROVIDER_RATE_LIMITED",
      extra: { httpStatus: 429, errorClass: "quota_exceeded" },
    });
    rememberModelSkip("cloudflare", cf3b.id, quota);
    const hops = listRetryHops({
      request: { providerId: "cloudflare", modelId: cf3b.id, messages: [{ role: "user", content: "hi" }] },
      error: quota,
      models: [cf3b, cf1b, groq],
    });
    expect(hops.every((hop) => hop.providerId !== "cloudflare")).toBe(true);
  });
});
