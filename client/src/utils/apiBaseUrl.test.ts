import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl } from "./apiBaseUrl";

describe("resolveApiBaseUrl", () => {
  it("prefers VITE_API_BASE_URL over VITE_API_URL", () => {
    expect(
      resolveApiBaseUrl({
        PROD: true,
        VITE_API_BASE_URL: "https://api.ken-ai.tech/api/",
        VITE_API_URL: "https://ignored.example/api",
      }),
    ).toBe("https://api.ken-ai.tech/api");
  });

  it("accepts VITE_API_URL when the canonical name is unset", () => {
    expect(
      resolveApiBaseUrl({
        PROD: true,
        VITE_API_URL: "https://api.ken-ai.tech/api",
      }),
    ).toBe("https://api.ken-ai.tech/api");
  });

  it("uses localhost only in Vite dev", () => {
    expect(resolveApiBaseUrl({ DEV: true })).toBe("http://localhost:5000/api");
  });

  it("refuses to hardcode localhost in a production bundle", () => {
    expect(() => resolveApiBaseUrl({ PROD: true })).toThrow(/VITE_API_BASE_URL/);
  });

  it("keeps auth on the API host so Vercel SPA rewrites cannot swallow login", () => {
    expect(
      resolveApiBaseUrl({
        PROD: true,
        VITE_API_BASE_URL: "https://api.ken-ai.tech/api",
      }),
    ).toBe("https://api.ken-ai.tech/api");
  });
});
