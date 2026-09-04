import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/AppError.js";
import type { AIProvider, AIResponse } from "./AIProvider.js";

const fakeGenerate = vi.fn<(request: { modelId: string; providerId?: string }) => Promise<AIResponse>>();
const assertModelAvailable = vi.fn();
const resolveCredentials = vi.fn();
const listPublicModels = vi.fn();

const fakeAdapter: AIProvider = {
  id: "groq",
  name: "Groq",
  type: "groq",
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
  envKeyCount: () => 1,
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
    delete (fakeAdapter as { stream?: AIProvider["stream"] }).stream;
    listPublicModels.mockResolvedValue([
      {
        id: "gpt-4o-mini",
        providerId: "openai",
        name: "GPT-4o mini",
        capabilities: ["text"],
        enabled: true,
        available: true,
      },
      {
        id: "openai/gpt-oss-120b",
        providerId: "groq",
        name: "GPT OSS 120B",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "openai/gpt-oss-20b",
        providerId: "groq",
        name: "GPT OSS 20B",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
    ]);
    resolveCredentials.mockResolvedValue({
      providerId: "groq",
      name: "Groq",
      type: "groq",
      apiKey: "test-groq-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    });
    assertModelAvailable.mockResolvedValue({
      id: "openai/gpt-oss-20b",
      providerId: "groq",
      name: "GPT OSS 20B",
      capabilities: ["text"],
      enabled: true,
      available: true,
    });
    fakeGenerate.mockResolvedValue({
      content: "ok",
      model: "openai/gpt-oss-20b",
      provider: "groq",
      finishReason: "stop",
    });
  });

  it("routes generate through the adapter after the model is confirmed available", async () => {
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const result = await manager.generate({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("ok");
    expect(fakeGenerate).toHaveBeenCalledTimes(1);
  });

  it("skips the registry lookup when the caller already confirmed the model", async () => {
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    await manager.generate({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Hi" }],
      skipAvailabilityCheck: true,
    });

    expect(assertModelAvailable).not.toHaveBeenCalled();
    expect(fakeGenerate).toHaveBeenCalledTimes(1);
  });

  it("gives every model call the Ken AI identity, whichever route built the prompt", async () => {
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    await manager.generate({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Which model are you?" }],
    });

    const sent = fakeGenerate.mock.calls[0]?.[0] as unknown as { messages: { role: string; content: string }[] };
    expect(sent.messages[0]?.role).toBe("system");
    expect(sent.messages[0]?.content).toContain("You are Ken AI");
    expect(sent.messages[1]).toMatchObject({ role: "user", content: "Which model are you?" });
  });

  it("does not repeat the identity when the caller already sent it", async () => {
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const { KEN_IDENTITY } = await import("../chat/identity.js");
    const manager = new AIProviderManager();
    await manager.generate({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [
        { role: "system", content: `${KEN_IDENTITY}\n\nreply policy` },
        { role: "user", content: "Hi" },
      ],
    });

    const sent = fakeGenerate.mock.calls[0]?.[0] as unknown as { messages: { role: string }[] };
    expect(sent.messages).toHaveLength(2);
  });

  it("does not silently switch models when the requested model is unavailable", async () => {
    assertModelAvailable.mockRejectedValue(
      new AppError("Model unavailable", { statusCode: 404, code: "MODEL_UNAVAILABLE" }),
    );
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();

    await expect(
      manager.generate({
        providerId: "groq",
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
      .mockRejectedValueOnce(new AppError("Groq request failed", { statusCode: 502, code: "PROVIDER_ERROR" }))
      .mockResolvedValueOnce({
        content: "fallback-ok",
        model: "gpt-4o-mini",
        provider: "openai",
        finishReason: "stop",
      });

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager({ fallbackProviderId: "openai" });
    const result = await manager.generate({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("fallback-ok");
    expect(fakeGenerate).toHaveBeenCalledTimes(2);
    expect(fakeGenerate.mock.calls[1]?.[0]).toMatchObject({ providerId: "openai", modelId: "gpt-4o-mini" });
  });

  it("does not switch providers when no fallback is configured", async () => {
    fakeGenerate.mockRejectedValue(
      new AppError("Groq request failed", { statusCode: 502, code: "PROVIDER_ERROR" }),
    );
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager({ fallbackProviderId: "" });

    await expect(
      manager.generate({
        providerId: "groq",
        modelId: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).rejects.toMatchObject({ code: "PROVIDER_ERROR" });
    expect(fakeGenerate).toHaveBeenCalledTimes(1);
  });

  it("routes OpenAI failures to Groq openai/gpt-oss-20b when that hop is configured", async () => {
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: providerId === "groq" ? "groq" : "openai",
      apiKey: "test-fallback-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));
    fakeGenerate
      .mockRejectedValueOnce(
        new AppError("OpenAI rate limited", { statusCode: 429, code: "PROVIDER_RATE_LIMITED" }),
      )
      .mockResolvedValueOnce({
        content: "hello from groq",
        model: "openai/gpt-oss-20b",
        provider: "groq",
        finishReason: "stop",
      });

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager({ fallbackProviderId: "groq", fallbackModelId: "openai/gpt-oss-20b" });
    const result = await manager.generate({
      providerId: "openai",
      modelId: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("hello from groq");
    expect(fakeGenerate.mock.calls[1]?.[0]).toMatchObject({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
    });
  });

  it("can hop from Groq 20B to Groq 120B on the first 429", async () => {
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: "groq",
      apiKey: "test-fallback-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));
    fakeGenerate
      .mockRejectedValueOnce(
        new AppError("Groq rate limited", { statusCode: 429, code: "PROVIDER_RATE_LIMITED" }),
      )
      .mockResolvedValueOnce({
        content: "hello from groq 70b",
        model: "openai/gpt-oss-120b",
        provider: "groq",
        finishReason: "stop",
      });

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager({
      fallbackProviderId: "groq",
      fallbackModelId: "openai/gpt-oss-120b",
    });
    const result = await manager.generate({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("hello from groq 70b");
    expect(fakeGenerate.mock.calls[1]?.[0]).toMatchObject({
      providerId: "groq",
      modelId: "openai/gpt-oss-120b",
    });
  });

  it("walks the free fallback chain when no explicit hop is set", async () => {
    listPublicModels.mockResolvedValue([
      {
        id: "llama-3.3-70b",
        providerId: "cerebras",
        name: "Llama 3.3 70B",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "openai/gpt-oss-20b",
        providerId: "groq",
        name: "GPT OSS 20B",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
    ]);
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: "openai-compatible",
      apiKey: "test-free-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));
    fakeGenerate
      .mockRejectedValueOnce(new AppError("Groq request failed", { statusCode: 502, code: "PROVIDER_ERROR" }))
      .mockResolvedValueOnce({
        content: "from-cerebras",
        model: "llama-3.3-70b",
        provider: "cerebras",
        finishReason: "stop",
      });

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const result = await manager.generate({
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("from-cerebras");
    expect(fakeGenerate.mock.calls[1]?.[0]).toMatchObject({
      providerId: "cerebras",
      modelId: "llama-3.3-70b",
    });
  });

  it("aliases a retired fallback model id onto its supported replacement", async () => {
    // AI_FALLBACK_MODEL_ID may still name a decommissioned Groq model. The
    // registry filters those out, so without aliasing the hop resolves to
    // nothing and the configured fallback silently never runs.
    fakeGenerate
      .mockRejectedValueOnce(new AppError("Primary failed", { statusCode: 502, code: "PROVIDER_ERROR" }))
      .mockResolvedValueOnce({
        content: "from-fallback",
        model: "openai/gpt-oss-120b",
        provider: "groq",
        finishReason: "stop",
      });

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager({
      fallbackProviderId: "groq",
      fallbackModelId: "llama-3.3-70b-versatile",
    });

    const result = await manager.generate({
      providerId: "openai",
      modelId: "gpt-4o-mini",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("from-fallback");
    expect(fakeGenerate.mock.calls[1]?.[0]).toMatchObject({
      providerId: "groq",
      modelId: "openai/gpt-oss-120b",
    });
  });
});
