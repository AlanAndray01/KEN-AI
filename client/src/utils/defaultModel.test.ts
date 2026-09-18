import { describe, expect, it } from "vitest";
import type { PublicAIModel } from "@Ken/shared";
import { pickDefaultModel, shouldReplaceStoredModel } from "./defaultModel";

function model(partial: Partial<PublicAIModel> & Pick<PublicAIModel, "id" | "providerId" | "name">): PublicAIModel {
  return {
    capabilities: ["text", "streaming"],
    enabled: true,
    available: true,
    ...partial,
  };
}

describe("pickDefaultModel", () => {
  it("prefers Gemini 3.5 Flash Lite over 3.8 Flash when both are available", () => {
    const lite = model({ id: "gemini-3.5-flash-lite", providerId: "gemini", name: "Gemini 3.5 Flash Lite" });
    const flash = model({ id: "gemini-3.8-flash", providerId: "gemini", name: "Gemini 3.8 Flash" });
    const qwen = model({ id: "qwen/qwen3.8-27b", providerId: "groq", name: "Qwen 3.8 27B" });
    const llama = model({ id: "llama-3.3-70b", providerId: "cerebras", name: "Llama 3.3 70B (Cerebras)" });

    expect(pickDefaultModel([llama, qwen, flash, lite])).toEqual(lite);
  });

  it("falls back to Gemini 3.8 Flash when Lite is missing", () => {
    const flash = model({ id: "gemini-3.8-flash", providerId: "gemini", name: "Gemini 3.8 Flash" });
    const qwen = model({ id: "qwen/qwen3.8-27b", providerId: "groq", name: "Qwen 3.8 27B" });

    expect(pickDefaultModel([qwen, flash])).toEqual(flash);
  });

  it("falls back to Groq Qwen, never Llama, when Gemini is missing", () => {
    const qwen = model({ id: "qwen/qwen3.8-27b", providerId: "groq", name: "Qwen 3.8 27B" });
    const llama = model({ id: "llama-3.3-70b", providerId: "cerebras", name: "Llama 3.3 70B (Cerebras)" });
    const openai = model({ id: "gpt-4o-mini", providerId: "openai", name: "GPT-4o mini" });

    expect(pickDefaultModel([llama, openai, qwen])).toEqual(qwen);
    expect(pickDefaultModel([llama, openai])).toEqual(openai);
  });

  it("ignores Gemini when the provider is not configured", () => {
    const gemini = model({
      id: "gemini-3.5-flash-lite",
      providerId: "gemini",
      name: "Gemini 3.5 Flash Lite",
      available: false,
    });
    const qwen = model({ id: "qwen/qwen3.8-27b", providerId: "groq", name: "Qwen 3.8 27B" });

    expect(pickDefaultModel([gemini, qwen])).toEqual(qwen);
  });
});

describe("shouldReplaceStoredModel", () => {
  const lite = model({ id: "gemini-3.5-flash-lite", providerId: "gemini", name: "Gemini 3.5 Flash Lite" });
  const flash = model({ id: "gemini-3.8-flash", providerId: "gemini", name: "Gemini 3.8 Flash" });
  const qwen = model({ id: "qwen/qwen3.8-27b", providerId: "groq", name: "Qwen 3.8 27B" });

  it("replaces an empty or leftover retired Llama selection", () => {
    expect(shouldReplaceStoredModel({ providerId: "", modelId: "" }, lite, [lite, flash, qwen])).toBe(true);
    expect(
      shouldReplaceStoredModel({ providerId: "groq", modelId: "llama-3.3-70b-versatile" }, qwen, [qwen]),
    ).toBe(true);
    expect(
      shouldReplaceStoredModel({ providerId: "cerebras", modelId: "llama-3.3-70b" }, qwen, [
        qwen,
        model({ id: "llama-3.3-70b", providerId: "cerebras", name: "Llama 3.3 70B (Cerebras)" }),
      ]),
    ).toBe(true);
  });

  it("keeps an existing Gemini 3.8 thread so stored conversations still load", () => {
    expect(
      shouldReplaceStoredModel({ providerId: "gemini", modelId: "gemini-3.8-flash" }, lite, [lite, flash, qwen]),
    ).toBe(false);
  });

  it("replaces a retired Gemini 2.5 selection so the picker moves to Flash Lite", () => {
    expect(
      shouldReplaceStoredModel({ providerId: "gemini", modelId: "gemini-2.5-flash" }, lite, [lite, flash, qwen]),
    ).toBe(true);
  });

  it("replaces a retired Gemini 1.5 selection so the picker does not keep a shut-down id", () => {
    expect(
      shouldReplaceStoredModel({ providerId: "gemini", modelId: "gemini-1.5-flash" }, lite, [lite, flash, qwen]),
    ).toBe(true);
    expect(
      shouldReplaceStoredModel({ providerId: "gemini", modelId: "gemini-1.5-pro" }, lite, [lite, flash, qwen]),
    ).toBe(true);
  });

  it("keeps an explicit Groq pick that still exists", () => {
    expect(shouldReplaceStoredModel({ providerId: "groq", modelId: "qwen/qwen3.8-27b" }, lite, [lite, flash, qwen])).toBe(
      false,
    );
  });

  it("replaces a retired Qwen 3.6 selection so the picker moves off a 404 model", () => {
    // Groq answers qwen/qwen3.6-27b with model_not_found, and MODEL_UNAVAILABLE
    // is non-retryable, so a stored 3.6 pick fails the turn outright instead of
    // falling back. The alias has to move it rather than let it sit there.
    expect(
      shouldReplaceStoredModel({ providerId: "groq", modelId: "qwen/qwen3.6-27b" }, lite, [lite, flash, qwen]),
    ).toBe(true);
  });
});
