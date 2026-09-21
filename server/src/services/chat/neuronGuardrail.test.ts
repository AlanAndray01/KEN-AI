import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_QUALITY_MODEL_ID,
  CLOUDFLARE_TINY_MODEL_ID,
  CLOUDFLARE_VISION_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GEMINI_PRO_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  type ModelCapability,
} from "@Ken/shared";
import type { RoutableModel } from "./autoRoute.js";
import {
  classifyNeuronTier,
  downshiftForNeurons,
  isHeavyNeuronModel,
  neuronInputBudget,
  neuronMaxHistory,
  neuronOutputTokens,
  pruneTurnContext,
  LITE_INPUT_TOKENS,
  LITE_MAX_HISTORY_MESSAGES,
} from "./neuronGuardrail.js";

function model(
  providerId: string,
  id: string,
  capabilities: ModelCapability[] = ["text", "streaming"],
): RoutableModel {
  return { providerId, id, capabilities, available: true, enabled: true };
}

const groqFast = model("groq", DEFAULT_GROQ_MODEL_ID);
const groq120 = model("groq", GROQ_QUALITY_MODEL_ID);
const geminiLite = model("gemini", DEFAULT_GEMINI_MODEL_ID, ["text", "vision", "files", "streaming", "tools"]);
const geminiPro = model("gemini", GEMINI_PRO_MODEL_ID, ["text", "vision", "files", "streaming", "tools"]);
const gpt41 = model("openai", "gpt-4.1", ["text", "vision", "files", "streaming", "tools"]);
const gptMini = model("openai", DEFAULT_OPENAI_MODEL_ID, ["text", "vision", "files", "streaming", "tools"]);
const cf70 = model("cloudflare", CLOUDFLARE_QUALITY_MODEL_ID);
const cf3b = model("cloudflare", DEFAULT_CLOUDFLARE_MODEL_ID);
const cf1b = model("cloudflare", CLOUDFLARE_TINY_MODEL_ID);
const scout = model("cloudflare", CLOUDFLARE_VISION_MODEL_ID, ["text", "vision", "streaming"]);

describe("classifyNeuronTier", () => {
  it("sends greetings and structural how-tos to the lite rung", () => {
    expect(classifyNeuronTier({ content: "hi" })).toBe("lite");
    expect(classifyNeuronTier({ content: "What is the capital of Japan?" })).toBe("lite");
    expect(
      classifyNeuronTier({
        content: "Can you explain how the water cycle works and why clouds form at different heights",
      }),
    ).toBe("lite");
  });

  it("sends proofs, deep code, and huge pastes to the large rung", () => {
    expect(classifyNeuronTier({ content: "Prove that the square root of 2 is irrational" })).toBe("large");
    expect(
      classifyNeuronTier({ content: "Write a TypeScript Express middleware that rate limits requests per user" }),
    ).toBe("large");
    const words = "the quick brown fox jumps over the lazy dog analysis report section".split(" ");
    const document = Array.from({ length: 8_000 }, (_, i) => words[i % words.length]).join(" ");
    expect(classifyNeuronTier({ content: `Summarise this document:\n\n${document}` })).toBe("large");
  });
});

describe("downshiftForNeurons", () => {
  it("moves Auto off Cloudflare 70B onto 3B for a lite turn", () => {
    expect(
      downshiftForNeurons({
        providerId: "cloudflare",
        modelId: CLOUDFLARE_QUALITY_MODEL_ID,
        models: [cf70, cf3b, cf1b],
        tier: "lite",
      }),
    ).toEqual({ providerId: "cloudflare", modelId: DEFAULT_CLOUDFLARE_MODEL_ID, downshifted: true });
  });

  it("moves Groq 120B onto Qwen and Gemini Pro onto Flash Lite", () => {
    expect(
      downshiftForNeurons({
        providerId: "groq",
        modelId: GROQ_QUALITY_MODEL_ID,
        models: [groq120, groqFast],
        tier: "lite",
      }),
    ).toEqual({ providerId: "groq", modelId: DEFAULT_GROQ_MODEL_ID, downshifted: true });
    expect(
      downshiftForNeurons({
        providerId: "gemini",
        modelId: GEMINI_PRO_MODEL_ID,
        models: [geminiPro, geminiLite],
        tier: "lite",
      }),
    ).toEqual({ providerId: "gemini", modelId: DEFAULT_GEMINI_MODEL_ID, downshifted: true });
    expect(
      downshiftForNeurons({
        providerId: "openai",
        modelId: "gpt-4.1",
        models: [gpt41, gptMini],
        tier: "lite",
      }),
    ).toEqual({ providerId: "openai", modelId: DEFAULT_OPENAI_MODEL_ID, downshifted: true });
  });

  it("does not spend Cloudflare neurons to 'save' a Groq or Gemini pick", () => {
    expect(
      downshiftForNeurons({
        providerId: "groq",
        modelId: GROQ_QUALITY_MODEL_ID,
        models: [groq120, cf3b],
        tier: "lite",
      }),
    ).toEqual({ providerId: "groq", modelId: GROQ_QUALITY_MODEL_ID, downshifted: false });
  });

  it("leaves a pinned heavyweight, a vision hop, and an already-lite model alone", () => {
    expect(
      downshiftForNeurons({
        providerId: "cloudflare",
        modelId: CLOUDFLARE_QUALITY_MODEL_ID,
        models: [cf70, cf3b],
        tier: "lite",
        pinned: true,
      }).downshifted,
    ).toBe(false);
    expect(
      downshiftForNeurons({
        providerId: "cloudflare",
        modelId: CLOUDFLARE_VISION_MODEL_ID,
        models: [scout, cf3b],
        tier: "lite",
        need: "vision",
      }).downshifted,
    ).toBe(false);
    expect(
      downshiftForNeurons({
        providerId: "groq",
        modelId: DEFAULT_GROQ_MODEL_ID,
        models: [groqFast, groq120],
        tier: "lite",
      }).downshifted,
    ).toBe(false);
    expect(
      downshiftForNeurons({
        providerId: "cloudflare",
        modelId: CLOUDFLARE_QUALITY_MODEL_ID,
        models: [cf70, cf3b],
        tier: "large",
      }).downshifted,
    ).toBe(false);
  });
});

describe("isHeavyNeuronModel", () => {
  it("treats 70B, 120B, Pro, and Scout as heavy and Flux / 3B as not", () => {
    expect(isHeavyNeuronModel("cloudflare", CLOUDFLARE_QUALITY_MODEL_ID)).toBe(true);
    expect(isHeavyNeuronModel("cloudflare", CLOUDFLARE_VISION_MODEL_ID)).toBe(true);
    expect(isHeavyNeuronModel("cloudflare", DEFAULT_CLOUDFLARE_MODEL_ID)).toBe(false);
    expect(isHeavyNeuronModel("cloudflare", "@cf/black-forest-labs/flux-1-schnell")).toBe(false);
    expect(isHeavyNeuronModel("gemini", GEMINI_PRO_MODEL_ID)).toBe(true);
    expect(isHeavyNeuronModel("gemini", DEFAULT_GEMINI_MODEL_ID)).toBe(false);
  });
});

describe("pruneTurnContext", () => {
  it("keeps a lite turn inside the lite prefill ceiling and the four-turn window", () => {
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `turn-${index} ${"word ".repeat(80)}`,
    }));
    const pruned = pruneTurnContext({
      messages: [{ role: "system", content: "Stay brief" }, ...history],
      providerId: "cloudflare",
      modelId: DEFAULT_CLOUDFLARE_MODEL_ID,
      tier: "lite",
      contextWindow: 80_000,
    });
    const rest = pruned.filter((message) => message.role !== "system");
    expect(rest.length).toBeLessThanOrEqual(LITE_MAX_HISTORY_MESSAGES);
    expect(rest.at(-1)?.content.startsWith("turn-10")).toBe(true);
    const tokens = pruned.reduce((sum, message) => sum + Math.ceil(message.content.length / 4) + 4, 0);
    expect(tokens).toBeLessThanOrEqual(LITE_INPUT_TOKENS);
  });
});

describe("neuron budgets", () => {
  it("clips Cloudflare output and uses the lite history window", () => {
    expect(neuronMaxHistory("lite")).toBe(4);
    expect(neuronMaxHistory("large")).toBe(10);
    expect(neuronInputBudget("lite", "cloudflare")).toBe(LITE_INPUT_TOKENS);
    expect(neuronInputBudget("lite", "groq")).toBe(LITE_INPUT_TOKENS);
    expect(neuronOutputTokens("lite", "cloudflare", 4_096)).toBe(768);
    expect(neuronOutputTokens("lite", "groq", 1_024)).toBe(1_024);
    expect(neuronOutputTokens("large", "cloudflare", 16_384)).toBe(2_048);
  });
});
