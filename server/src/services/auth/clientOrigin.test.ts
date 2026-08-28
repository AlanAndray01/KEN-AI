import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * CLIENT_URL holds a comma-separated CORS allowlist. Anywhere it is
 * interpolated into a URL it must be split first, or the result is an
 * unopenable address like
 * "https://ken-ai.tech,https://www.ken-ai.tech/login?error=google_not_configured"
 * — which is exactly what the deployed OAuth redirect produced.
 */
async function clientOriginWith(clientUrl: string): Promise<string> {
  vi.resetModules();
  vi.doMock("../../config/env.js", () => ({
    env: { CLIENT_URL: clientUrl },
    isProduction: false,
  }));
  const { clientOrigin } = await import("./cookies.js");
  return clientOrigin();
}

afterEach(() => {
  vi.doUnmock("../../config/env.js");
  vi.resetModules();
});

describe("clientOrigin", () => {
  it("returns the first origin when CLIENT_URL lists several", async () => {
    const origin = await clientOriginWith("https://ken-ai.tech,https://www.ken-ai.tech");
    expect(origin).toBe("https://ken-ai.tech");
  });

  it("never emits a comma, so the redirect is always a usable URL", async () => {
    const origin = await clientOriginWith("https://ken-ai.tech,https://www.ken-ai.tech");
    expect(origin).not.toContain(",");
    expect(`${origin}/login?error=google_not_configured`).toBe(
      "https://ken-ai.tech/login?error=google_not_configured",
    );
  });

  it("tolerates whitespace around the separators", async () => {
    const origin = await clientOriginWith(" https://ken-ai.tech , https://www.ken-ai.tech ");
    expect(origin).toBe("https://ken-ai.tech");
  });

  it("strips a trailing slash so paths do not double up", async () => {
    const origin = await clientOriginWith("https://ken-ai.tech/");
    expect(origin).toBe("https://ken-ai.tech");
  });

  it("passes a single origin through unchanged", async () => {
    const origin = await clientOriginWith("http://localhost:5173");
    expect(origin).toBe("http://localhost:5173");
  });
});
