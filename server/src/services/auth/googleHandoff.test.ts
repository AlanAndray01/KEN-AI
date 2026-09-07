import { describe, expect, it } from "vitest";
import { googleHandoffHtml } from "./googleHandoff.js";

describe("googleHandoffHtml", () => {
  const url =
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=abc&redirect_uri=https%3A%2F%2Fapi.ken-ai.tech%2Fapi%2Fauth%2Fgoogle%2Fcallback";

  it("renders a non-redirect document that still points at Google", () => {
    const html = googleHandoffHtml(url);
    expect(html).toContain("accounts.google.com");
    expect(html).toContain("state=abc");
    expect(html).toContain("location.replace(");
  });

  it("rejects a non-Google target", () => {
    expect(() => googleHandoffHtml("https://evil.example/phish")).toThrow(/Invalid Google authorization URL/);
  });
});
