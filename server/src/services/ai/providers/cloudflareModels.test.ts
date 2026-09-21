import { CLOUDFLARE_IMAGE_MODEL_ID } from "@Ken/shared";
import { describe, expect, it, vi, afterEach } from "vitest";
import { CloudflareProvider } from "./CloudflareProvider.js";
import { cloudflareModelsUrl, parseCloudflareModelIds } from "./cloudflareModels.js";

const CF_BASE = "https://api.cloudflare.com/client/v4/accounts/acct123/ai/v1";

describe("cloudflareModelsUrl", () => {
  it("addresses the Workers AI listing route, not the OpenAI one", () => {
    // Verified live: "GET .../ai/v1/models" answers 405 for a valid token.
    expect(cloudflareModelsUrl(CF_BASE)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct123/ai/models/search",
    );
  });

  it("tolerates a trailing slash", () => {
    expect(cloudflareModelsUrl(`${CF_BASE}/`)).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct123/ai/models/search",
    );
  });

  it("declines to guess a path for a non-Cloudflare base URL", () => {
    expect(cloudflareModelsUrl("https://proxy.internal/v1")).toBeUndefined();
  });
});

describe("parseCloudflareModelIds", () => {
  it("reads result[].name, which is where Workers AI puts model ids", () => {
    expect(
      parseCloudflareModelIds({
        result: [{ name: "@cf/meta/llama-3.2-3b-instruct" }, { name: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" }],
      }),
    ).toEqual(["@cf/meta/llama-3.2-3b-instruct", "@cf/meta/llama-3.3-70b-instruct-fp8-fast"]);
  });

  it("returns nothing for an OpenAI-shaped or empty body", () => {
    expect(parseCloudflareModelIds({ data: [{ id: "gpt-4o" }] })).toEqual([]);
    expect(parseCloudflareModelIds(null)).toEqual([]);
  });
});

describe("CloudflareProvider credential probe", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function provider() {
    return new CloudflareProvider({
      id: "cloudflare",
      name: "Cloudflare Workers AI",
      type: "openai-compatible",
      credentials: { apiKey: "cf-token", baseUrl: CF_BASE },
    });
  }

  it("reports a working Workers AI account as connected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(provider().validateCredentials()).resolves.toMatchObject({ status: "connected" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct123/ai/models/search",
    );
  });

  it("still reports a rejected token as invalid", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 403 })));
    await expect(provider().validateCredentials()).resolves.toMatchObject({ status: "invalid" });
  });

  it("refuses to send Flux through /chat/completions", async () => {
    await expect(
      provider().generate({
        providerId: "cloudflare",
        modelId: CLOUDFLARE_IMAGE_MODEL_ID,
        messages: [{ role: "user", content: "a cube" }],
      }),
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  });
});
