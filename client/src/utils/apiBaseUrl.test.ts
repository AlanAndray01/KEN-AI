import { describe, expect, it } from "vitest";
import { resolveApiBaseUrl, resolveAuthBaseUrl } from "./apiBaseUrl";

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
});

describe("resolveAuthBaseUrl", () => {
  const production = {
    PROD: true,
    VITE_API_BASE_URL: "https://api.ken-ai.tech/api",
  };

  it("uses a same-origin prefix on the live client hosts", () => {
    expect(resolveAuthBaseUrl(production, "ken-ai.tech")).toBe("/api");
    expect(resolveAuthBaseUrl(production, "www.ken-ai.tech")).toBe("/api");
  });

  it("keeps the cross-origin API on other hosts so chat is not proxied", () => {
    expect(resolveAuthBaseUrl(production, "localhost")).toBe("https://api.ken-ai.tech/api");
    expect(resolveAuthBaseUrl(production, "ken-ai.vercel.app")).toBe("https://api.ken-ai.tech/api");
  });
});
