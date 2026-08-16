import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/AppError.js";
import { isRetryableProviderError } from "./fallback.js";

describe("isRetryableProviderError", () => {
  it("retries provider 5xx and network failures", () => {
    expect(isRetryableProviderError(new AppError("fail", { statusCode: 502, code: "PROVIDER_ERROR" }))).toBe(true);
    expect(isRetryableProviderError(new Error("fetch failed"))).toBe(true);
  });

  it("does not retry model, config, or auth failures", () => {
    expect(
      isRetryableProviderError(new AppError("Model unavailable", { statusCode: 404, code: "MODEL_UNAVAILABLE" })),
    ).toBe(false);
    expect(
      isRetryableProviderError(
        new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" }),
      ),
    ).toBe(false);
    expect(
      isRetryableProviderError(new AppError("Invalid credentials", { statusCode: 401, code: "PROVIDER_INVALID_CREDENTIALS" })),
    ).toBe(false);
  });
});
