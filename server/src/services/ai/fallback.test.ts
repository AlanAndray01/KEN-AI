import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/AppError.js";
import { isProviderLeaveError, isRetryableProviderError } from "./fallback.js";

describe("isRetryableProviderError", () => {
  it("retries provider 5xx and network failures", () => {
    expect(isRetryableProviderError(new AppError("fail", { statusCode: 502, code: "PROVIDER_ERROR" }))).toBe(true);
    expect(isRetryableProviderError(new Error("fetch failed"))).toBe(true);
  });

  it("does not retry model or config failures", () => {
    expect(
      isRetryableProviderError(new AppError("Model unavailable", { statusCode: 404, code: "MODEL_UNAVAILABLE" })),
    ).toBe(false);
    expect(
      isRetryableProviderError(
        new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" }),
      ),
    ).toBe(false);
  });

  it("retries a vendor 401 so the next hop can run instead of toasting login language", () => {
    const error = new AppError("That model could not authenticate the request.", {
      statusCode: 502,
      code: "PROVIDER_INVALID_CREDENTIALS",
    });
    expect(isRetryableProviderError(error)).toBe(true);
    expect(isProviderLeaveError(error)).toBe(true);
  });

  it("does not retry app-level RATE_LIMITED but does retry provider quota", () => {
    expect(
      isRetryableProviderError(new AppError("Too many requests", { statusCode: 429, code: "RATE_LIMITED" })),
    ).toBe(false);
    expect(
      isRetryableProviderError(
        new AppError("Gemini per-minute request limit reached.", { statusCode: 429, code: "PROVIDER_RATE_LIMITED" }),
      ),
    ).toBe(true);
  });
});
