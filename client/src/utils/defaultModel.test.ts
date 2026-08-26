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
  it("prefers Groq GPT OSS 20B when that model is available", () => {
    const groq20 = model({ id: "openai/gpt-oss-20b", providerId: "groq", name: "GPT OSS 20B" });
    const groq120 = model({ id: "openai/gpt-oss-120b", providerId: "groq", name: "GPT OSS 120B" });
    const openai = model({ id: "gpt-4o-mini", providerId: "openai", name: "GPT-4o mini" });

    expect(pickDefaultModel([openai, groq120, groq20])).toEqual(groq20);
  });

  it("falls back to Groq 120B, then OpenAI, when faster models are missing", () => {
    const groq120 = model({ id: "openai/gpt-oss-120b", providerId: "groq", name: "GPT OSS 120B" });
    const openai = model({ id: "gpt-4o-mini", providerId: "openai", name: "GPT-4o mini" });

    expect(pickDefaultModel([openai, groq120])).toEqual(groq120);
    expect(pickDefaultModel([openai])).toEqual(openai);
  });

  it("ignores Groq when the provider is not configured", () => {
    const groq20 = model({
      id: "openai/gpt-oss-20b",
      providerId: "groq",
      name: "GPT OSS 20B",
      available: false,
    });
    const openai = model({ id: "gpt-4o-mini", providerId: "openai", name: "GPT-4o mini" });

    expect(pickDefaultModel([groq20, openai])).toEqual(openai);
  });
});

describe("shouldReplaceStoredModel", () => {
  const groq20 = model({ id: "openai/gpt-oss-20b", providerId: "groq", name: "GPT OSS 20B" });
  const openai = model({ id: "gpt-4o-mini", providerId: "openai", name: "GPT-4o mini" });

  it("replaces an empty or leftover Gemini selection when Groq is the default", () => {
    expect(shouldReplaceStoredModel({ providerId: "", modelId: "" }, groq20, [groq20, openai])).toBe(true);
    expect(
      shouldReplaceStoredModel({ providerId: "gemini", modelId: "gemini-flash-latest" }, groq20, [groq20, openai]),
    ).toBe(true);
  });

  it("replaces retired Groq Llama IDs even if they were previously stored", () => {
    expect(
      shouldReplaceStoredModel(
        { providerId: "groq", modelId: "llama-3.3-70b-versatile" },
        groq20,
        [groq20, openai],
      ),
    ).toBe(true);
  });

  it("keeps an explicit non-Gemini model that still exists", () => {
    expect(
      shouldReplaceStoredModel({ providerId: "openai", modelId: "gpt-4o-mini" }, groq20, [groq20, openai]),
    ).toBe(false);
  });
});
