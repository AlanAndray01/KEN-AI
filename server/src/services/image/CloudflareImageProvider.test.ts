import { describe, expect, it, vi, afterEach } from "vitest";
import { CloudflareImageProvider, extractFluxImage } from "./CloudflareImageProvider.js";

/** Smallest valid JPEG and PNG signatures, base64-encoded as Workers AI returns them. */
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString("base64");
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64");

describe("extractFluxImage", () => {
  it("reads result.image and types it from the bytes, not a guess", () => {
    // Verified live: Schnell answers JPEG (FF D8 FF) with no media type in the
    // response body at all.
    expect(extractFluxImage({ result: { image: JPEG_B64 } })?.mimeType).toBe("image/jpeg");
    expect(extractFluxImage({ result: { image: PNG_B64 } })?.mimeType).toBe("image/png");
  });

  it("accepts a gateway-unwrapped image and a data-URI prefix", () => {
    expect(extractFluxImage({ image: JPEG_B64 })?.mimeType).toBe("image/jpeg");
    expect(extractFluxImage({ result: { image: `data:image/jpeg;base64,${JPEG_B64}` } })?.buffer.length).toBeGreaterThan(
      0,
    );
  });

  it("returns nothing for an error body or an empty image", () => {
    expect(extractFluxImage({ success: false, errors: [{ message: "AiError" }] })).toBeUndefined();
    expect(extractFluxImage({ result: { image: "" } })).toBeUndefined();
    expect(extractFluxImage(null)).toBeUndefined();
  });
});

describe("CloudflareImageProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts the prompt to the Workers AI run path for Flux", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ result: { image: JPEG_B64 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const image = await new CloudflareImageProvider("acct123", "cf-token").generate({
      prompt: "a red cube",
      userId: "user1",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.cloudflare.com/client/v4/accounts/acct123/ai/run/@cf/black-forest-labs/flux-1-schnell",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ prompt: "a red cube", steps: 4 });
    expect(image).toMatchObject({ mimeType: "image/jpeg", prompt: "a red cube" });
    expect(image.buffer.length).toBeGreaterThan(0);
  });

  it("surfaces a provider error rather than returning an empty image", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 400 })));
    await expect(
      new CloudflareImageProvider("acct123", "cf-token").generate({ prompt: "x", userId: "user1" }),
    ).rejects.toMatchObject({ code: "IMAGE_GENERATION_PROVIDER_ERROR", expose: true });
  });

  it("names a 429 as rate-limited, not a generic drop", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 429 })));
    await expect(
      new CloudflareImageProvider("acct123", "cf-token").generate({ prompt: "x", userId: "user1" }),
    ).rejects.toMatchObject({
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      statusCode: 429,
      message: expect.stringContaining("rate-limited"),
    });
  });

  it("names Workers AI neuron exhaustion instead of a generic provider drop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            errors: [
              {
                code: 4006,
                message: "AiError: you have used up your daily free allocation of 10,000 neurons",
              },
            ],
          }),
          { status: 429 },
        ),
      ),
    );
    await expect(
      new CloudflareImageProvider("acct123", "cf-token").generate({ prompt: "x", userId: "user1" }),
    ).rejects.toMatchObject({
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      statusCode: 429,
      expose: true,
      message: expect.stringContaining("daily Workers AI quota"),
      extra: expect.objectContaining({ errorClass: "quota_exceeded", providerCode: "4006" }),
    });
  });

  it("names a 401 as a credential problem, not a generic drop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Unauthorized" }), { status: 401 })),
    );
    await expect(
      new CloudflareImageProvider("acct123", "cf-token").generate({ prompt: "x", userId: "user1" }),
    ).rejects.toMatchObject({
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      message: expect.stringContaining("CF_AI_GATEWAY_TOKEN"),
    });
  });

  it("refuses a gateway URL that has no gateway token, without calling Flux", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new CloudflareImageProvider("acct123", "cf-token", {
        runUrl:
          "https://gateway.ai.cloudflare.com/v1/acct123/ken-ai-gateway/workers-ai/@cf/black-forest-labs/flux-1-schnell",
      }).generate({ prompt: "x", userId: "user1" }),
    ).rejects.toMatchObject({ code: "IMAGE_GENERATION_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the gateway token when the run URL is the gateway", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ result: { image: JPEG_B64 } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await new CloudflareImageProvider("acct123", "cf-token", {
      runUrl:
        "https://gateway.ai.cloudflare.com/v1/acct123/ken-ai-gateway/workers-ai/@cf/black-forest-labs/flux-1-schnell",
      gatewayToken: "aig-token",
    }).generate({ prompt: "a red cube", userId: "user1" });

    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["cf-aig-authorization"]).toBe("Bearer aig-token");
  });

  it("is unconfigured without both the account id and the token", () => {
    expect(new CloudflareImageProvider("", "cf-token").isConfigured()).toBe(false);
    expect(new CloudflareImageProvider("acct123", "").isConfigured()).toBe(false);
    expect(new CloudflareImageProvider("acct123", "cf-token").isConfigured()).toBe(true);
  });
});
