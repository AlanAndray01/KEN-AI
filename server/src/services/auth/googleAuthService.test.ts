import { describe, expect, it } from "vitest";
import { AppError } from "../../utils/AppError.js";
import { assertGoogleAuthorizeUrl } from "./googleAuthService.js";

describe("assertGoogleAuthorizeUrl", () => {
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=abc&redirect_uri=https%3A%2F%2Fapi.ken-ai.tech%2Fapi%2Fauth%2Fgoogle%2Fcallback";

  it("allows the Google authorization host", () => {
    expect(assertGoogleAuthorizeUrl(url)).toBe(url);
  });

  it("rejects a non-Google target", () => {
    expect(() => assertGoogleAuthorizeUrl("https://evil.example/phish")).toThrow(AppError);
  });
});
