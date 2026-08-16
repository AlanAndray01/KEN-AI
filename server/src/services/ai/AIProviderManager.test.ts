import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/AppError.js";
import type { AIProvider, AIResponse } from "./AIProvider.js";

const fakeGenerate = vi.fn<(request: { modelId: string; providerId?: string }) => Promise<AIResponse>>();
const assertModelAvailable = vi.fn();
const resolveCredentials = vi.fn();
const listPublicModels = vi.fn();

const fakeAdapter: AIProvider = {
  id: "gemini",
  name: "Google Gemini",
  type: "gemini",
  generate: (request) => fakeGenerate(request),
  getModels: async () => [],
  validateCredentials: async () => ({ status: "connected", message: "ok" }),
  getCapabilities: () => ["text", "streaming"],
};

vi.mock("./createProviderAdapter.js", () => ({
  createProviderAdapter: () => fakeAdapter,
}));

vi.mock("./credentials.js", () => ({
  resolveCredentials: (...args: unknown[]) => resolveCredentials(...args),
  requireConfigured: (value: unknown) => {
    if (!value || !(value as { configured?: boolean; enabled?: boolean }).configured || !(value as { enabled?: boolean }).enabled) {
      throw new AppError("No AI provider configured.", { statusCode: 503, code: "PROVIDER_NOT_CONFIGURED" });
    }
    return value;
  },
}));

vi.mock("./ModelRegistry.js", () => ({
  modelRegistry: {
    assertModelAvailable: (...args: unknown[]) => assertModelAvailable(...args),
    listPublicModels: (...args: unknown[]) => listPublicModels(...args),
  },
}));

describe("AIProviderManager", () => {
  beforeEach(() => {
    fakeGenerate.mockReset();
    assertModelAvailable.mockReset();
    resolveCredentials.mockReset();
    listPublicModels.mockReset();
    listPublicModels.mockResolvedValue([
      {
        id: "gemini-2.5-flash",
        providerId: "gemini",
        name: "Gemini 2.5 Flash",
        capabilities: ["text"],
        enabled: true,
        available: true,
      },
      {
        id: "gpt-4o-mini",
        providerId: "openai",
        name: "GPT-4o mini",
        capabilities: ["text"],
        enabled: true,
        available: true,
      },
    ]);
    resolveCredentials.mockResolvedValue({
      providerId: "gemini",
      name: "Google Gemini",
      type: "gemini",
      apiKey: "test-gemini-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    });
    assertModelAvailable.mockResolvedValue({
      id: "gemini-2.5-flash",
      providerId: "gemini",
      name: "Gemini 2.5 Flash",
      capabilities: ["text"],
      enabled: true,
      available: true,
    });
    fakeGenerate.mockResolvedValue({
      content: "ok",
      model: "gemini-2.5-flash",
      provider: "gemini",
      finishReason: "stop",
    });
  });

  it("routes generate through the adapter after the model is confirmed available", async () => {
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const result = await manager.generate({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("ok");
    expect(fakeGenerate).toHaveBeenCalledTimes(1);
  });

  it("does not silently switch models when the requested model is unavailable", async () => {
    assertModelAvailable.mockRejectedValue(
      new AppError("Model unavailable", { statusCode: 404, code: "MODEL_UNAVAILABLE" }),
    );
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();

    await expect(
      manager.generate({
        providerId: "gemini",
        modelId: "missing-model",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    expect(fakeGenerate).not.toHaveBeenCalled();
  });

  it("returns a clear error when no provider is configured", async () => {
    resolveCredentials.mockResolvedValue({
      providerId: "openai",
      name: "OpenAI",
      type: "openai",
      enabled: true,
      configured: false,
      source: "environment",
      capabilities: ["text"],
    });
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();

    await expect(
      manager.generate({
        providerId: "openai",
        modelId: "gpt-4o-mini",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED", message: "No AI provider configured." });
    expect(fakeGenerate).not.toHaveBeenCalled();
  });

  it("uses a configured fallback provider after a retryable primary failure", async () => {
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: providerId,
      apiKey: "test-fallback-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));
    fakeGenerate
      .mockRejectedValueOnce(new AppError("Gemini request failed", { statusCode: 502, code: "PROVIDER_ERROR" }))
      .mockResolvedValueOnce({
        content: "fallback-ok",
        model: "gpt-4o-mini",
        provider: "openai",
        finishReason: "stop",
      });

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager({ fallbackProviderId: "openai" });
    const result = await manager.generate({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("fallback-ok");
    expect(fakeGenerate).toHaveBeenCalledTimes(2);
    expect(fakeGenerate.mock.calls[1]?.[0]).toMatchObject({ providerId: "openai", modelId: "gpt-4o-mini" });
  });

  it("does not switch providers when no fallback is configured", async () => {
    fakeGenerate.mockRejectedValue(
      new AppError("Gemini request failed", { statusCode: 502, code: "PROVIDER_ERROR" }),
    );
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();

    await expect(
      manager.generate({
        providerId: "gemini",
        modelId: "gemini-2.5-flash",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect(fakeGenerate).toHaveBeenCalledTimes(1);
  });
});
