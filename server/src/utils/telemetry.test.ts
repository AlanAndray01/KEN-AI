import { describe, expect, it } from "vitest";
import { extraString, telemetry } from "./telemetry.js";

const SAMPLE_EVENTS = [
  telemetry({
    event: "image_backend_skip",
    backend: "cloudflare",
    modelId: "@cf/black-forest-labs/flux-1-schnell",
    skipReason: "IMAGE_GENERATION_PROVIDER_ERROR|429|quota_exceeded",
    skipCode: "IMAGE_GENERATION_PROVIDER_ERROR",
    nextBackend: "gemini",
  }),
  telemetry({
    event: "image_backend_fail",
    backend: "cloudflare",
    hop: true,
    status: 429,
    errorClass: "quota_exceeded",
    nextBackend: "gemini",
  }),
  telemetry({
    event: "image_backend_ok",
    backend: "gemini",
    priorFailures: 1,
  }),
  telemetry({
    event: "model_skip_set",
    providerId: "gemini",
    modelId: "gemini-3.8-flash",
    skipMs: 600_000,
    skipUntil: 1_700_000_000_000,
    skipCode: "PROVIDER_RATE_LIMITED",
    skipReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
    errorClass: "quota_exceeded",
    providerWide: false,
  }),
  telemetry({
    event: "model_skip_honoured",
    providerId: "gemini",
    modelId: "gemini-3.8-flash",
    skipReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
    hop: true,
  }),
  telemetry({
    event: "model_skip_hop",
    providerId: "gemini",
    fromModel: "gemini-3.8-flash",
    toModel: "gemini-3.5-flash-lite",
    hop: true,
    autoTask: "chat",
  }),
  telemetry({
    event: "provider_failover",
    primary: "groq",
    primaryModel: "openai/gpt-oss-120b",
    fallback: "gemini",
    fallbackModel: "gemini-3.5-flash-lite",
    hop: true,
  }),
  telemetry({
    event: "chat_stream_timing",
    requestedModel: "gemini-3.8-flash",
    activeModel: "gemini-3.5-flash-lite",
    hop: true,
    imageOnly: false,
    imageGenerated: true,
    ttfbMs: 120,
  }),
  telemetry({
    event: "dev_auth_code",
    kind: "verification",
    to: "ada@example.com",
  }),
] as const;

describe("telemetry", () => {
  it("drops undefined and round-trips through JSON", () => {
    const row = telemetry({
      event: "provider_failover",
      hop: true,
      retries: 1,
      skipReason: null,
      missing: undefined,
    });
    expect(row).toEqual({
      event: "provider_failover",
      hop: true,
      retries: 1,
      skipReason: null,
    });
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  });

  it("keeps every chat telemetry event JSON-parseable", () => {
    for (const row of SAMPLE_EVENTS) {
      const parsed = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
      expect(parsed).toEqual(row);
      expect(typeof parsed.event).toBe("string");
      expect(JSON.stringify(row)).not.toContain("undefined");
    }
  });
});

describe("extraString", () => {
  it("reads a string extra field and ignores others", () => {
    expect(extraString({ errorClass: "quota_exceeded" }, "errorClass")).toBe("quota_exceeded");
    expect(extraString({ errorClass: 429 }, "errorClass")).toBeUndefined();
    expect(extraString(undefined, "errorClass")).toBeUndefined();
  });
});
