import { describe, expect, it } from "vitest";
import {
  buildCompatibleChatBody,
  cloudflareMaxTokens,
  GEMINI_LOW_THINKING_TOKEN_RESERVE,
  GEMINI_THINKING_TOKEN_RESERVE,
  geminiMaxOutputTokens,
  geminiReasoningParams,
  groqReasoningParams,
} from "./compatibleChatBody.js";

const request = {
  providerId: "groq",
  modelId: "openai/gpt-oss-20b",
  messages: [{ role: "user" as const, content: "Hi" }],
};

describe("groqReasoningParams", () => {
  it("sets the lowest GPT-OSS thinking budget Groq allows", () => {
    expect(groqReasoningParams("openai/gpt-oss-20b")).toEqual({
      reasoning_effort: "low",
      include_reasoning: false,
    });
    expect(groqReasoningParams("openai/gpt-oss-120b")).toMatchObject({ reasoning_effort: "low" });
  });

  it("disables reasoning on Qwen, which is the one Groq model that accepts none", () => {
    expect(groqReasoningParams("qwen/qwen3.6-27b")).toEqual({ reasoning_effort: "none" });
    expect(groqReasoningParams("qwen/qwen3.6-27b", "none")).toEqual({ reasoning_effort: "none" });
  });
});

describe("buildCompatibleChatBody", () => {
  it("streams Groq GPT-OSS with low reasoning effort and a completion cap", () => {
    expect(buildCompatibleChatBody(request, { stream: true, providerId: "groq" })).toMatchObject({
      model: "openai/gpt-oss-20b",
      stream: true,
      stream_options: { include_usage: true },
      reasoning_effort: "low",
      include_reasoning: false,
      temperature: 0.6,
      max_completion_tokens: 1000,
    });
  });

  it("honours an explicit token cap instead of the Groq default", () => {
    expect(
      buildCompatibleChatBody({ ...request, maxTokens: 128 }, { stream: false, providerId: "groq" }),
    ).toMatchObject({ max_completion_tokens: 128 });
  });

  it("lets a budgeted turn past the unbudgeted default, up to the model's ceiling", () => {
    // OTPM is a refilling per-minute budget, not a per-request cap: Groq served
    // 8192 completion tokens on one request and 4975 on another. Flattening
    // every reply to the 1000 default is what cut code off mid-function.
    expect(
      buildCompatibleChatBody({ ...request, maxTokens: 16_384 }, { stream: false, providerId: "groq" }),
    ).toMatchObject({ max_completion_tokens: 16_384 });
  });

  it("clamps to the per-model ceiling Groq actually publishes", () => {
    // gpt-oss-20b tops out at 65536, qwen3.8-27b at 16384 — asking above is a 400.
    expect(
      buildCompatibleChatBody({ ...request, maxTokens: 999_999 }, { stream: false, providerId: "groq" }),
    ).toMatchObject({ max_completion_tokens: 65_536 });
    expect(
      buildCompatibleChatBody(
        { ...request, modelId: "qwen/qwen3.8-27b", maxTokens: 999_999 },
        { stream: false, providerId: "groq" },
      ),
    ).toMatchObject({ max_completion_tokens: 16_384 });
  });

  it("keeps Gemini thinking on the lowest budget the catalog accepts", () => {
    expect(geminiReasoningParams()).toEqual({ reasoning_effort: "low" });
    // `none` is a 400 on 3.5 Flash Lite; `minimal` is accepted and cut the
    // first visible token from 4-13s to under one second.
    expect(geminiReasoningParams("none")).toEqual({ reasoning_effort: "minimal" });
    expect(geminiMaxOutputTokens(1024)).toBe(1024 + GEMINI_THINKING_TOKEN_RESERVE);
    expect(geminiMaxOutputTokens(1024, "none")).toBe(1024 + GEMINI_LOW_THINKING_TOKEN_RESERVE);
    expect(geminiMaxOutputTokens(1024, "low")).toBe(1024 + GEMINI_LOW_THINKING_TOKEN_RESERVE);
    expect(
      buildCompatibleChatBody(
        { ...request, providerId: "gemini", modelId: "gemini-3.8-flash", maxTokens: 1024 },
        { stream: true, providerId: "gemini" },
      ),
    ).toMatchObject({
      model: "gemini-3.8-flash",
      stream: true,
      reasoning_effort: "low",
      max_tokens: 1024 + GEMINI_THINKING_TOKEN_RESERVE,
    });
    expect(
      buildCompatibleChatBody(
        {
          ...request,
          providerId: "gemini",
          modelId: "gemini-3.8-flash",
          maxTokens: 1024,
          reasoningEffort: "none",
        },
        { stream: true, providerId: "gemini" },
      ),
    ).toMatchObject({
      reasoning_effort: "minimal",
      max_tokens: 1024 + GEMINI_LOW_THINKING_TOKEN_RESERVE,
    });
  });

  it("leaves non-Groq providers on max_tokens and does not send reasoning knobs", () => {
    const body = buildCompatibleChatBody(
      { ...request, providerId: "openai", modelId: "gpt-4o-mini", maxTokens: 32 },
      { stream: false, providerId: "openai" },
    );
    expect(body).toMatchObject({ model: "gpt-4o-mini", max_tokens: 32 });
    expect(body).not.toHaveProperty("reasoning_effort");
    expect(body).not.toHaveProperty("max_completion_tokens");
  });

  it("sends Cloudflare requests through cloudflareMaxTokens, never a raw max_tokens", () => {
    const body = buildCompatibleChatBody(
      { ...request, providerId: "cloudflare", modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", maxTokens: 16_384 },
      { stream: false, providerId: "cloudflare" },
    );
    // The tiny "Hi" prompt leaves nearly the whole 24k ceiling free, so the
    // request should pass straight through, not get silently reduced.
    expect(body).toMatchObject({ max_tokens: 16_384 });
    expect(body).not.toHaveProperty("stream");
  });

  it("asks Cloudflare streams for a usage frame the same way Groq does", () => {
    expect(
      buildCompatibleChatBody(
        { ...request, providerId: "cloudflare", modelId: "@cf/meta/llama-3.2-3b-instruct" },
        { stream: true, providerId: "cloudflare" },
      ),
    ).toMatchObject({
      model: "@cf/meta/llama-3.2-3b-instruct",
      stream: true,
      stream_options: { include_usage: true },
    });
  });

  it("passes image_url through and keeps already-extracted PDF text, not file blocks", () => {
    const body = buildCompatibleChatBody(
      {
        ...request,
        providerId: "cloudflare",
        modelId: "@cf/meta/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: "Read these\n\nAttached file: note.pdf\nCloudflare PDF",
            parts: [
              { type: "inline", mimeType: "image/png", data: "AAAA" },
              {
                type: "inline",
                mimeType: "application/pdf",
                data: Buffer.from("%PDF-1.1\nBT (should not unzip here) Tj ET\n", "latin1").toString("base64"),
                filename: "note.pdf",
              },
            ],
          },
        ],
      },
      { stream: false, providerId: "cloudflare" },
    );
    const messages = body.messages as Array<{ content: unknown }>;
    const content = messages[0]?.content as unknown[];
    expect(content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "image_url" }),
        expect.objectContaining({ type: "text" }),
      ]),
    );
    expect(JSON.stringify(body)).not.toContain('"type":"file"');
    expect(JSON.stringify(content)).toContain("Cloudflare PDF");
  });
});

describe("cloudflareMaxTokens", () => {
  const model = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

  it("passes a small request through unclamped when there is plenty of room", () => {
    const messages = [{ role: "user" as const, content: "Hi" }];
    expect(cloudflareMaxTokens(model, messages, 1_024)).toBe(1_024);
  });

  it("shrinks the output ask once a long prompt has already used most of the 24k ceiling", () => {
    // ~500 words * 20 messages is well past what remains of a 24k total after
    // the 512-token safety margin, so the clamp must bite here.
    const big = "word ".repeat(500);
    const messages = Array.from({ length: 20 }, () => ({ role: "user" as const, content: big }));
    const clamped = cloudflareMaxTokens(model, messages, 16_384);
    expect(clamped).toBeLessThan(16_384);
    expect(clamped).toBeGreaterThanOrEqual(256);
  });

  it("never returns below the minimum floor even when the prompt alone exceeds the ceiling", () => {
    const messages = [{ role: "user" as const, content: "word ".repeat(50_000) }];
    expect(cloudflareMaxTokens(model, messages, 16_384)).toBe(256);
  });

  it("falls back to the tightest known ceiling for a model id it does not recognise", () => {
    const messages = [{ role: "user" as const, content: "Hi" }];
    // Same numeric ceiling as the 70B model (24000), since an unverified model
    // id gets the conservative default rather than an optimistic one.
    expect(cloudflareMaxTokens("@cf/some/unlisted-model", messages, 30_000)).toBeLessThan(24_000);
  });

  it("clamps to the caller's own smaller ask rather than always maxing out the room", () => {
    const messages = [{ role: "user" as const, content: "Hi" }];
    expect(cloudflareMaxTokens(model, messages, 100)).toBe(100);
  });
});
