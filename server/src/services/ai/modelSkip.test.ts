import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../../utils/AppError.js";
import {
  clearModelSkips,
  formatFallbackReason,
  nextOpenGeminiModelId,
  parseRetryAfterMs,
  peekModelSkip,
  rememberModelSkip,
} from "./modelSkip.js";

afterEach(() => {
  clearModelSkips();
});

describe("parseRetryAfterMs", () => {
  it("reads Google's retry-in hint", () => {
    expect(
      parseRetryAfterMs(
        "Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-3.8-flash\nPlease retry in 49.390613815s.",
      ),
    ).toBe(49391);
  });
});

describe("rememberModelSkip", () => {
  it("skips a 429 model until the hinted retry window", () => {
    rememberModelSkip(
      "gemini",
      "gemini-3.8-flash",
      new AppError("Provider rate limit reached.", {
        statusCode: 429,
        code: "PROVIDER_RATE_LIMITED",
        extra: { httpStatus: 429, errorClass: "quota_exceeded", retryAfterMs: 49_391 },
      }),
    );

    const skip = peekModelSkip("gemini", "gemini-3.8-flash");
    expect(skip?.reason).toBe("PROVIDER_RATE_LIMITED|429|quota_exceeded");
    expect(skip?.until).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("does not treat a 136ms RPM hint as permission to retry a daily-exhausted model", () => {
    rememberModelSkip(
      "gemini",
      "gemini-3.8-flash",
      new AppError("Provider rate limit reached.", {
        statusCode: 429,
        code: "PROVIDER_RATE_LIMITED",
        extra: { httpStatus: 429, errorClass: "quota_exceeded", retryAfterMs: 136 },
      }),
    );

    expect(peekModelSkip("gemini", "gemini-3.8-flash")?.until).toBeGreaterThan(Date.now() + 9 * 60_000);
  });

  it("does not skip a generic 502 onto the next turn", () => {
    rememberModelSkip(
      "gemini",
      "gemini-3.8-flash",
      new AppError("Provider request failed", { statusCode: 502, code: "PROVIDER_ERROR" }),
    );
    expect(peekModelSkip("gemini", "gemini-3.8-flash")).toBeUndefined();
  });
});

describe("nextOpenGeminiModelId", () => {
  it("keeps 3.8 in the catalog and hops to Lite when 3.8 is cooled down", () => {
    rememberModelSkip(
      "gemini",
      "gemini-3.8-flash",
      new AppError("Provider rate limit reached.", {
        statusCode: 429,
        code: "PROVIDER_RATE_LIMITED",
        extra: { errorClass: "quota_exceeded" },
      }),
    );
    expect(nextOpenGeminiModelId("gemini-3.8-flash")).toBe("gemini-3.5-flash-lite");
  });

  it("hops from the Lite default to 3.8 when Lite is cooled down", () => {
    rememberModelSkip(
      "gemini",
      "gemini-3.5-flash-lite",
      new AppError("Provider rate limit reached.", {
        statusCode: 429,
        code: "PROVIDER_RATE_LIMITED",
        extra: { errorClass: "quota_exceeded" },
      }),
    );
    expect(nextOpenGeminiModelId("gemini-3.5-flash-lite")).toBe("gemini-3.8-flash");
  });
});

describe("formatFallbackReason", () => {
  it("joins code, status, and error class without secrets", () => {
    expect(
      formatFallbackReason(
        new AppError("Provider rate limit reached.", {
          statusCode: 429,
          code: "PROVIDER_RATE_LIMITED",
          extra: { httpStatus: 429, errorClass: "quota_exceeded" },
        }),
      ),
    ).toBe("PROVIDER_RATE_LIMITED|429|quota_exceeded");
  });
});
