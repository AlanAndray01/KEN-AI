import { afterEach, describe, expect, it, vi } from "vitest";
import { extractOpenAIError, OpenAIImageProvider } from "./OpenAIImageProvider.js";

describe("OpenAIImageProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is configured when an OpenAI key is present", () => {
    const provider = new OpenAIImageProvider("sk-test");
    expect(provider.isConfigured()).toBe(true);
    expect(provider.id).toBe("openai");
  });

  it("posts the prompt to DALL·E and returns PNG bytes", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ data: [{ b64_json: "QUJD" }] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new OpenAIImageProvider("sk-test").generate({ prompt: "a lighthouse", userId: "u1" });
    expect(result.mimeType).toBe("image/png");
    expect(result.buffer.toString("base64")).toBe("QUJD");
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/v1/images/generations");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({
      model: "dall-e-3",
      prompt: "a lighthouse",
    });
  });

  it("names an OpenAI quota error instead of a generic provider drop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" },
          }),
          { status: 429 },
        ),
      ),
    );
    await expect(new OpenAIImageProvider("sk-test").generate({ prompt: "x", userId: "u1" })).rejects.toMatchObject({
      code: "IMAGE_GENERATION_PROVIDER_ERROR",
      statusCode: 429,
      expose: true,
      message: expect.stringContaining("out of quota"),
      extra: expect.objectContaining({ errorClass: "quota_exceeded", httpStatus: 429 }),
    });
  });
});

describe("extractOpenAIError", () => {
  it("reads the OpenAI error.message object", () => {
    expect(extractOpenAIError({ error: { message: "billing hard limit reached" } })).toBe("billing hard limit reached");
  });

  it("returns undefined when no error is present", () => {
    expect(extractOpenAIError({ data: [] })).toBeUndefined();
  });
});
