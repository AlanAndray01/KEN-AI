import { describe, expect, it } from "vitest";
import {
  buildCompatibleChatBody,
  GEMINI_LOW_THINKING_TOKEN_RESERVE,
  GEMINI_THINKING_TOKEN_RESERVE,
  geminiMaxOutputTokens,
  geminiReasoningParams,
  groqReasoningParams,
} from "./groqChatBody.js";

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

  it("caps Groq completion tokens at the free-tier OTPM ceiling", () => {
    expect(
      buildCompatibleChatBody({ ...request, maxTokens: 2048 }, { stream: false, providerId: "groq" }),
    ).toMatchObject({ max_completion_tokens: 1000 });
  });

  it("keeps Gemini thinking on the lowest budget the catalog accepts", () => {
    expect(geminiReasoningParams()).toEqual({ reasoning_effort: "low" });
    expect(geminiReasoningParams("none")).toEqual({ reasoning_effort: "low" });
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
      reasoning_effort: "low",
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
});
