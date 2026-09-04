import { describe, expect, it } from "vitest";
import { buildCompatibleChatBody, groqReasoningParams } from "./groqChatBody.js";

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
      max_completion_tokens: 2048,
    });
  });

  it("honours an explicit token cap instead of the Groq default", () => {
    expect(
      buildCompatibleChatBody({ ...request, maxTokens: 128 }, { stream: false, providerId: "groq" }),
    ).toMatchObject({ max_completion_tokens: 128 });
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
