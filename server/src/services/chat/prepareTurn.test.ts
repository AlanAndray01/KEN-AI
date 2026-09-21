import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTO_MODEL_ID,
  AUTO_PROVIDER_ID,
  CLOUDFLARE_QUALITY_MODEL_ID,
  DEFAULT_CLOUDFLARE_MODEL_ID,
  DEFAULT_GEMINI_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
} from "@Ken/shared";
import { NEURON_GUARD_REASON } from "./neuronGuardrail.js";

const listPublicModels = vi.fn();
const assertModelAvailable = vi.fn();
const applyEnabledTools = vi.fn(async () => ({ systemMessages: [], files: [] }));

vi.mock("../ai/ModelRegistry.js", () => ({
  modelRegistry: {
    listPublicModels: (...args: unknown[]) => listPublicModels(...args),
    assertModelAvailable: (...args: unknown[]) => assertModelAvailable(...args),
  },
}));

vi.mock("../ai/AIProviderManager.js", () => ({
  aiProviderManager: {
    applyEnabledTools: (...args: unknown[]) => applyEnabledTools(...args),
  },
}));

vi.mock("../storage/fileService.js", () => ({
  assertAttachmentsAllowed: vi.fn(),
  loadOwnedFiles: vi.fn(async () => []),
}));

function cfModel(id: string, name: string) {
  return {
    id,
    providerId: "cloudflare",
    name,
    capabilities: ["text", "streaming"],
    enabled: true,
    available: true,
    contextWindow: id.includes("70b") ? 24_000 : 80_000,
  };
}

describe("prepareTurn neuron guardrail", () => {
  beforeEach(() => {
    listPublicModels.mockReset();
    assertModelAvailable.mockReset();
    applyEnabledTools.mockClear();
  });

  it("classifies a greeting as lite and keeps a pinned 70B pick", async () => {
    assertModelAvailable.mockResolvedValue(cfModel(CLOUDFLARE_QUALITY_MODEL_ID, "Llama 70B"));
    const { prepareTurn } = await import("./prepareTurn.js");
    const turn = await prepareTurn({
      userId: "user1",
      content: "hi",
      providerId: "cloudflare",
      modelId: CLOUDFLARE_QUALITY_MODEL_ID,
    });
    expect(turn).toMatchObject({
      providerId: "cloudflare",
      modelId: CLOUDFLARE_QUALITY_MODEL_ID,
      neuronTier: "large",
    });
  });

  it("uses Cloudflare 3B, not 70B, when Auto has only Workers AI left", async () => {
    listPublicModels.mockResolvedValue([
      cfModel(CLOUDFLARE_QUALITY_MODEL_ID, "Llama 70B"),
      cfModel(DEFAULT_CLOUDFLARE_MODEL_ID, "Llama 3B"),
    ]);
    const { prepareTurn } = await import("./prepareTurn.js");
    const turn = await prepareTurn({
      userId: "user1",
      content: "hi",
      providerId: AUTO_PROVIDER_ID,
      modelId: AUTO_MODEL_ID,
    });
    expect(turn.modelId).toBe(DEFAULT_CLOUDFLARE_MODEL_ID);
    expect(turn.neuronTier).toBe("lite");
    expect(turn.threadModelId).toBe(AUTO_MODEL_ID);
  });

  it("downshifts Auto off Groq 120B onto Flash Lite when the cheap Groq id is missing", async () => {
    listPublicModels.mockResolvedValue([
      {
        id: GROQ_QUALITY_MODEL_ID,
        providerId: "groq",
        name: "GPT OSS 120B",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: DEFAULT_GEMINI_MODEL_ID,
        providerId: "gemini",
        name: "Flash Lite",
        capabilities: ["text", "vision", "files", "streaming", "tools"],
        enabled: true,
        available: true,
      },
    ]);
    const { prepareTurn } = await import("./prepareTurn.js");
    const turn = await prepareTurn({
      userId: "user1",
      content: "Can you explain how the water cycle works and why clouds form at different heights in the sky",
      providerId: AUTO_PROVIDER_ID,
      modelId: AUTO_MODEL_ID,
    });
    expect(turn).toMatchObject({
      providerId: "gemini",
      modelId: DEFAULT_GEMINI_MODEL_ID,
      neuronTier: "lite",
    });
    expect(turn.routeReason).toContain(NEURON_GUARD_REASON);
  });

  it("never downshifts a pinned Gemini Pro greeting onto Flash Lite", async () => {
    assertModelAvailable.mockResolvedValue({
      id: "gemini-3.1-pro-preview",
      providerId: "gemini",
      name: "Gemini 3.1 Pro",
      capabilities: ["text", "vision", "files", "streaming", "tools"],
      enabled: true,
      available: true,
    });
    const { prepareTurn } = await import("./prepareTurn.js");
    const turn = await prepareTurn({
      userId: "user1",
      content: "hi",
      providerId: "gemini",
      modelId: "gemini-3.1-pro-preview",
    });
    expect(turn).toMatchObject({
      providerId: "gemini",
      modelId: "gemini-3.1-pro-preview",
      neuronTier: "large",
    });
    expect(turn.autoTask).toBeUndefined();
  });
});
