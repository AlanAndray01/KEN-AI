import { describe, expect, it, vi } from "vitest";

vi.mock("../../models/AIModel.js", () => ({
  AIModel: {
    find: vi.fn(async () => [
      {
        modelId: "qwen/qwen3.8-27b",
        providerId: "groq",
        name: "Qwen 3.8 27B",
        capabilities: ["text", "streaming"],
        enabled: true,
      },
      {
        modelId: "gpt-4o-mini",
        providerId: "openai",
        name: "GPT-4o mini",
        capabilities: ["text"],
        enabled: true,
      },
    ]),
  },
}));

vi.mock("./credentials.js", () => ({
  loadGlobalProviders: vi.fn(async () => [
    {
      id: "groq",
      providerId: "groq",
      name: "Groq",
      type: "groq",
      enabled: true,
      capabilities: ["text"],
      hasStoredKey: false,
    },
  ]),
  describeConfiguredSecret: vi.fn(async (providerId: string) => {
    if (providerId === "groq") {
      return { configured: true, source: "environment", keyLastFour: "zzzz", hasUserKey: false };
    }
    return { configured: false, source: "environment", hasUserKey: false };
  }),
}));

vi.mock("./providers/MockProvider.js", () => ({
  isMockAiAllowed: () => false,
}));

describe("ModelRegistry", () => {
  it("lists only enabled models from configured providers as available", async () => {
    const { ModelRegistry } = await import("./ModelRegistry.js");
    const registry = new ModelRegistry();
    const publicModels = await registry.listPublicModels();

    expect(publicModels.every((model) => model.available)).toBe(true);
    expect(publicModels.some((model) => model.providerId === "groq")).toBe(true);
    expect(publicModels.find((model) => model.providerId === "groq")?.id).toBe("qwen/qwen3.8-27b");
    expect(publicModels.some((model) => model.providerId === "openai")).toBe(false);
    expect(JSON.stringify(publicModels)).not.toContain("encryptedApiKey");
    expect(JSON.stringify(publicModels)).not.toMatch(/"apiKey"/);
  });

  it("reuses the provider listing for a few seconds so chat prepare is not a second fan-out", async () => {
    const { AIModel } = await import("../../models/AIModel.js");
    vi.mocked(AIModel.find).mockClear();
    const { ModelRegistry } = await import("./ModelRegistry.js");
    const registry = new ModelRegistry();
    await registry.listPublicModels();
    await registry.listPublicModels();
    expect(AIModel.find).toHaveBeenCalledTimes(1);
  });
});
