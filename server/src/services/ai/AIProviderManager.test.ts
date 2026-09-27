import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/AppError.js";
import type { AIProvider, AIResponse, StreamEvent } from "./AIProvider.js";
import { clearModelSkips, rememberModelSkip } from "./modelSkip.js";

const fakeGenerate = vi.fn<(request: { modelId: string; providerId?: string }) => Promise<AIResponse>>();
const assertModelAvailable = vi.fn();
const resolveCredentials = vi.fn();
const listPublicModels = vi.fn();
const consumePlatformChatQuota = vi.fn<(userId: string, source: string) => Promise<void>>();
const assertUnderSpendCeiling = vi.fn<(userId: string, source: string) => Promise<void>>();

vi.mock("./platformChatQuota.js", () => ({
  consumePlatformChatQuota: (userId: string, source: string) => consumePlatformChatQuota(userId, source),
}));

vi.mock("./spendCeiling.js", () => ({
  assertUnderSpendCeiling: (userId: string, source: string) => assertUnderSpendCeiling(userId, source),
}));

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
    listRoutableModels: (...args: unknown[]) => listPublicModels(...args),
  },
}));

describe("AIProviderManager", () => {
  beforeEach(() => {
    clearModelSkips();
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

  it("aliases retired Gemini 2.5 Flash onto the current Gemini default", async () => {
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
    fakeGenerate.mockResolvedValue({
      content: "from-gemini",
      model: "gemini-3.5-flash-lite",
      provider: "gemini",
      finishReason: "stop",
    });

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const result = await manager.generate({
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Hi" }],
      skipAvailabilityCheck: true,
    });

    expect(result.content).toBe("from-gemini");
    expect(fakeGenerate.mock.calls[0]?.[0]).toMatchObject({
      providerId: "gemini",
      modelId: "gemini-3.5-flash-lite",
    });
  });

  it("does not hop to Groq when Gemini reports the model unavailable", async () => {
    listPublicModels.mockResolvedValue([
      {
        id: "gemini-3.8-flash",
        providerId: "gemini",
        name: "Gemini 3.8 Flash",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "qwen/qwen3.6-27b",
        providerId: "groq",
        name: "Qwen 3.6 27B",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
    ]);
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: providerId,
      apiKey: "test-gemini-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));
    fakeGenerate.mockRejectedValue(
      new AppError(
        "This model models/gemini-3.8-flash is no longer available to new users.",
        { statusCode: 404, code: "MODEL_UNAVAILABLE" },
      ),
    );

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();

    await expect(
      manager.generate({
        providerId: "gemini",
        modelId: "gemini-3.8-flash",
        messages: [{ role: "user", content: "Hi" }],
        skipAvailabilityCheck: true,
      }),
    ).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
    expect(fakeGenerate).toHaveBeenCalledTimes(1);
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

  it("emits a fallback event and stays on Gemini Lite after a 3.8 429", async () => {
    listPublicModels.mockResolvedValue([
      {
        id: "gemini-3.8-flash",
        providerId: "gemini",
        name: "Gemini 3.8 Flash",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "gemini-3.5-flash-lite",
        providerId: "gemini",
        name: "Gemini 3.5 Flash Lite",
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
      type: providerId,
      apiKey: "test-gemini-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));

    const attempted: Array<{ modelId: string; firstByteTimeoutMs?: number }> = [];
    fakeAdapter.stream = async function* (request: {
      modelId: string;
      maxTokens?: number;
      reasoningEffort?: string;
      firstByteTimeoutMs?: number;
    }) {
      attempted.push({ modelId: request.modelId, firstByteTimeoutMs: request.firstByteTimeoutMs });
      if (request.modelId === "gemini-3.8-flash") {
        throw new AppError("Provider rate limit reached.", {
          statusCode: 429,
          code: "PROVIDER_RATE_LIMITED",
          extra: { httpStatus: 429, errorClass: "quota_exceeded", retryAfterMs: 49_391 },
        });
      }
      yield { type: "start", model: request.modelId, provider: "gemini" };
      yield { type: "chunk", text: "There is" };
      yield {
        type: "complete",
        response: { content: "There is", model: request.modelId, provider: "gemini", finishReason: "stop" },
      };
    };

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const events: StreamEvent[] = [];
    for await (const event of manager.stream({
      providerId: "gemini",
      modelId: "gemini-3.8-flash",
      messages: [{ role: "user", content: "So Whose the father of science?" }],
      skipAvailabilityCheck: true,
      maxTokens: 1024,
      reasoningEffort: "none",
      requestId: "5dd687df-c1e0-4eb3-8b5d-3433d9ce24b8",
    })) {
      events.push(event);
    }

    expect(attempted).toEqual([
      { modelId: "gemini-3.8-flash", firstByteTimeoutMs: 2_500 },
      { modelId: "gemini-3.5-flash-lite", firstByteTimeoutMs: undefined },
    ]);
    expect(events.find((event) => event.type === "fallback")).toMatchObject({
      type: "fallback",
      model: "gemini-3.5-flash-lite",
      provider: "gemini",
      fallbackFrom: "gemini-3.8-flash",
      fallbackReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
    });
  });

  it("skips a cooled-down 3.8 hop and copies the caller's token budget onto Lite", async () => {
    listPublicModels.mockResolvedValue([
      {
        id: "gemini-3.8-flash",
        providerId: "gemini",
        name: "Gemini 3.8 Flash",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "gemini-3.5-flash-lite",
        providerId: "gemini",
        name: "Gemini 3.5 Flash Lite",
        capabilities: ["text", "streaming"],
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
    rememberModelSkip(
      "gemini",
      "gemini-3.8-flash",
      new AppError("Provider rate limit reached.", {
        statusCode: 429,
        code: "PROVIDER_RATE_LIMITED",
        extra: { httpStatus: 429, errorClass: "quota_exceeded", retryAfterMs: 49_391 },
      }),
    );

    const hops: Array<{ modelId: string; maxTokens?: number; reasoningEffort?: string }> = [];
    fakeAdapter.stream = async function* (request: {
      modelId: string;
      maxTokens?: number;
      reasoningEffort?: string;
    }) {
      hops.push(request);
      yield { type: "chunk", text: "There is" };
      yield {
        type: "complete",
        response: { content: "There is", model: request.modelId, provider: "gemini", finishReason: "stop" },
      };
    };

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const events: StreamEvent[] = [];
    for await (const event of manager.stream({
      providerId: "gemini",
      modelId: "gemini-3.8-flash",
      messages: [{ role: "user", content: "Hi" }],
      skipAvailabilityCheck: true,
      maxTokens: 1024,
      reasoningEffort: "none",
    })) {
      events.push(event);
    }

    expect(hops).toEqual([
      expect.objectContaining({
        modelId: "gemini-3.5-flash-lite",
        maxTokens: 1024,
        reasoningEffort: "none",
      }),
    ]);
    expect(hops[0]).not.toHaveProperty("firstByteTimeoutMs");
    expect(events[0]).toMatchObject({
      type: "fallback",
      model: "gemini-3.5-flash-lite",
      fallbackFrom: "gemini-3.8-flash",
    });
  });

  it("sends the Lite default straight to Gemini without a 3.8 first-byte abort", async () => {
    listPublicModels.mockResolvedValue([
      {
        id: "gemini-3.5-flash-lite",
        providerId: "gemini",
        name: "Gemini 3.5 Flash Lite",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "gemini-3.8-flash",
        providerId: "gemini",
        name: "Gemini 3.8 Flash",
        capabilities: ["text", "streaming"],
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

    const attempted: Array<{ modelId: string; firstByteTimeoutMs?: number }> = [];
    fakeAdapter.stream = async function* (request: { modelId: string; firstByteTimeoutMs?: number }) {
      attempted.push({ modelId: request.modelId, firstByteTimeoutMs: request.firstByteTimeoutMs });
      yield { type: "start", model: request.modelId, provider: "gemini" };
      yield { type: "chunk", text: "There is" };
      yield {
        type: "complete",
        response: { content: "There is", model: request.modelId, provider: "gemini", finishReason: "stop" },
      };
    };

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    for await (const _event of manager.stream({
      providerId: "gemini",
      modelId: "gemini-3.5-flash-lite",
      messages: [{ role: "user", content: "Hi" }],
      skipAvailabilityCheck: true,
    })) {
      /* drain */
    }

    expect(attempted).toEqual([{ modelId: "gemini-3.5-flash-lite", firstByteTimeoutMs: undefined }]);
  });
});

describe("AIProviderManager with a pinned model (fallbackPolicy: quota-only)", () => {
  const geminiModels = [
    {
      id: "gemini-3.1-pro-preview",
      providerId: "gemini",
      name: "Gemini 3.1 Pro",
      capabilities: ["text", "streaming"],
      enabled: true,
      available: true,
    },
    {
      id: "gemini-3.5-flash-lite",
      providerId: "gemini",
      name: "Gemini 3.5 Flash Lite",
      capabilities: ["text", "streaming"],
      enabled: true,
      available: true,
    },
  ];

  const quotaError = () =>
    new AppError("Provider rate limit reached.", {
      statusCode: 429,
      code: "PROVIDER_RATE_LIMITED",
      extra: { httpStatus: 429, errorClass: "quota_exceeded" },
    });

  beforeEach(() => {
    clearModelSkips();
    fakeGenerate.mockReset();
    assertModelAvailable.mockReset();
    resolveCredentials.mockReset();
    listPublicModels.mockReset();
    delete (fakeAdapter as { stream?: AIProvider["stream"] }).stream;
    listPublicModels.mockResolvedValue(geminiModels);
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
  });

  /** Streams a turn pinned to Gemini 3.1 Pro, capturing events and any thrown error. */
  async function streamPinned(): Promise<{ events: StreamEvent[]; error?: unknown }> {
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const events: StreamEvent[] = [];
    try {
      for await (const event of manager.stream({
        providerId: "gemini",
        modelId: "gemini-3.1-pro-preview",
        messages: [{ role: "user", content: "Hello" }],
        skipAvailabilityCheck: true,
        fallbackPolicy: "quota-only",
      })) {
        events.push(event);
      }
      return { events };
    } catch (error) {
      return { events, error };
    }
  }

  it("surfaces a 503 on the chosen model instead of answering from another one", async () => {
    const attempted: string[] = [];
    fakeAdapter.stream = async function* (request: { modelId: string }) {
      attempted.push(request.modelId);
      if (request.modelId === "gemini-3.1-pro-preview") {
        throw new AppError("The model is overloaded.", { statusCode: 503, code: "PROVIDER_UNAVAILABLE" });
      }
      yield { type: "chunk", text: "Hi" };
    };

    const { events, error } = await streamPinned();

    expect(attempted).toEqual(["gemini-3.1-pro-preview"]);
    expect(error).toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
    expect(events.some((event) => event.type === "fallback")).toBe(false);
  });

  it("does not hop off the chosen model for a quota error when the policy is none", async () => {
    const attempted: string[] = [];
    // A stream that fails before its first event, like a provider 429.
    // eslint-disable-next-line require-yield
    fakeAdapter.stream = async function* (request: { modelId: string }) {
      attempted.push(request.modelId);
      throw quotaError();
    };

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const events: StreamEvent[] = [];
    let error: unknown;
    try {
      for await (const event of manager.stream({
        providerId: "gemini",
        modelId: "gemini-3.1-pro-preview",
        messages: [{ role: "user", content: "Hello" }],
        skipAvailabilityCheck: true,
        fallbackPolicy: "none",
      })) {
        events.push(event);
      }
    } catch (caught) {
      error = caught;
    }

    expect(attempted).toEqual(["gemini-3.1-pro-preview"]);
    expect(error).toMatchObject({ code: "PROVIDER_RATE_LIMITED" });
    expect(events.some((event) => event.type === "fallback")).toBe(false);
  });

  it("tries the pinned model again despite a cached 429 when the policy is none", async () => {
    rememberModelSkip(
      "gemini",
      "gemini-3.1-pro-preview",
      quotaError(),
    );
    const attempted: string[] = [];
    fakeAdapter.stream = async function* (request: { modelId: string }) {
      attempted.push(request.modelId);
      yield {
        type: "complete",
        response: { content: "Hi", model: request.modelId, provider: "gemini", finishReason: "stop" },
      };
    };

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    for await (const _event of manager.stream({
      providerId: "gemini",
      modelId: "gemini-3.1-pro-preview",
      messages: [{ role: "user", content: "Hello" }],
      skipAvailabilityCheck: true,
      fallbackPolicy: "none",
    })) {
      /* drain */
    }

    expect(attempted).toEqual(["gemini-3.1-pro-preview"]);
  });

  it("leaves the chosen model only for a quota error, and reports the switch", async () => {
    const attempted: string[] = [];
    fakeAdapter.stream = async function* (request: { modelId: string }) {
      attempted.push(request.modelId);
      if (request.modelId === "gemini-3.1-pro-preview") throw quotaError();
      yield { type: "chunk", text: "Hi" };
      yield {
        type: "complete",
        response: { content: "Hi", model: request.modelId, provider: "gemini", finishReason: "stop" },
      };
    };

    const { events, error } = await streamPinned();

    expect(error).toBeUndefined();
    expect(attempted).toEqual(["gemini-3.1-pro-preview", "gemini-3.5-flash-lite"]);
    expect(events.find((event) => event.type === "fallback")).toMatchObject({
      type: "fallback",
      model: "gemini-3.5-flash-lite",
      fallbackFrom: "gemini-3.1-pro-preview",
      fallbackReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
    });
  });

  it("gives the chosen model its full time instead of the 2.5s failover abort", async () => {
    const budgets: Array<number | undefined> = [];
    fakeAdapter.stream = async function* (request: { modelId: string; firstByteTimeoutMs?: number }) {
      budgets.push(request.firstByteTimeoutMs);
      yield {
        type: "complete",
        response: { content: "Hi", model: request.modelId, provider: "gemini", finishReason: "stop" },
      };
    };

    await streamPinned();

    expect(budgets).toEqual([undefined]);
  });

  it("tries the chosen model again despite a cached 503 cool-down", async () => {
    rememberModelSkip(
      "gemini",
      "gemini-3.1-pro-preview",
      new AppError("The model is overloaded.", { statusCode: 503, code: "PROVIDER_UNAVAILABLE" }),
    );
    const attempted: string[] = [];
    fakeAdapter.stream = async function* (request: { modelId: string }) {
      attempted.push(request.modelId);
      yield {
        type: "complete",
        response: { content: "Hi", model: request.modelId, provider: "gemini", finishReason: "stop" },
      };
    };

    const { events } = await streamPinned();

    expect(attempted).toEqual(["gemini-3.1-pro-preview"]);
    expect(events.some((event) => event.type === "fallback")).toBe(false);
  });

  it("steps aside at once for a cached quota cool-down, and still reports it", async () => {
    rememberModelSkip("gemini", "gemini-3.1-pro-preview", quotaError());
    const attempted: string[] = [];
    fakeAdapter.stream = async function* (request: { modelId: string }) {
      attempted.push(request.modelId);
      yield {
        type: "complete",
        response: { content: "Hi", model: request.modelId, provider: "gemini", finishReason: "stop" },
      };
    };

    const { events } = await streamPinned();

    // No wasted round-trip to a model already known to be over quota.
    expect(attempted).toEqual(["gemini-3.5-flash-lite"]);
    expect(events.find((event) => event.type === "fallback")).toMatchObject({
      model: "gemini-3.5-flash-lite",
      fallbackFrom: "gemini-3.1-pro-preview",
    });
  });
});

describe("AIProviderManager Cloudflare context fit", () => {
  beforeEach(() => {
    clearModelSkips();
    fakeGenerate.mockReset();
    assertModelAvailable.mockReset();
    resolveCredentials.mockReset();
    listPublicModels.mockReset();
    delete (fakeAdapter as { stream?: AIProvider["stream"] }).stream;
    listPublicModels.mockResolvedValue([]);
    resolveCredentials.mockResolvedValue({
      providerId: "cloudflare",
      name: "Cloudflare Workers AI",
      type: "openai-compatible",
      apiKey: "test-cf-token",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text", "streaming"],
    });
    assertModelAvailable.mockResolvedValue({
      id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      providerId: "cloudflare",
      name: "Llama 3.3 70B (Cloudflare)",
      capabilities: ["text"],
      enabled: true,
      available: true,
    });
    fakeGenerate.mockResolvedValue({
      content: "ok",
      model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      provider: "cloudflare",
      finishReason: "stop",
    });
  });

  it("re-trims a long history to fit the real per-model window before it reaches the adapter", async () => {
    // Real prose, not a repeated character — BPE tokenizers compress
    // "xxxx...x" far below its char count, which would understate what this
    // test is checking. Twenty of these messages are sized for a much larger
    // provider's budget than Cloudflare 70B's real 24,000-token ceiling.
    const words =
      "the quick brown fox jumps over the lazy dog near the riverbank while clouds drift".split(" ");
    const paragraph = Array.from({ length: 500 }, (_, i) => words[i % words.length]).join(" ");
    const longHistory = Array.from({ length: 20 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as const,
      content: paragraph,
    }));

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    await manager.generate({
      providerId: "cloudflare",
      modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      messages: longHistory,
    });

    expect(fakeGenerate).toHaveBeenCalledTimes(1);
    const sent = fakeGenerate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    expect(sent.messages.length).toBeLessThan(longHistory.length);
  });

  it("leaves a short conversation untouched, since it already fits", async () => {
    const shortHistory = [{ role: "user" as const, content: "Hi" }];

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    await manager.generate({
      providerId: "cloudflare",
      modelId: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      messages: shortHistory,
    });

    const sent = fakeGenerate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    expect(sent.messages.at(-1)?.content).toBe("Hi");
  });

  it("does not bounce a Gemini 401 image turn back onto Gemini", async () => {
    listPublicModels.mockResolvedValue([
      {
        id: "gemini-3.5-flash-lite",
        providerId: "gemini",
        name: "Gemini 3.5 Flash Lite",
        capabilities: ["text", "vision", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "gemini-3.8-flash",
        providerId: "gemini",
        name: "Gemini 3.8 Flash",
        capabilities: ["text", "vision", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "qwen/qwen3.6-27b",
        providerId: "groq",
        name: "Qwen",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
      {
        id: "@cf/meta/llama-4-scout-17b-16e-instruct",
        providerId: "cloudflare",
        name: "Scout",
        capabilities: ["text", "vision", "streaming"],
        enabled: true,
        available: true,
      },
    ]);
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: providerId,
      apiKey: "test-key-zzzzzzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));

    const attempted: string[] = [];
    fakeAdapter.stream = async function* (request: { providerId?: string; modelId: string }) {
      attempted.push(`${request.providerId ?? "gemini"}:${request.modelId}`);
      if ((request.providerId ?? fakeAdapter.id) === "gemini" || request.modelId.startsWith("gemini-")) {
        throw new AppError("That model could not authenticate the request.", {
          statusCode: 502,
          code: "PROVIDER_INVALID_CREDENTIALS",
          extra: { httpStatus: 401 },
        });
      }
      yield { type: "chunk", text: "a cube" };
      yield {
        type: "complete",
        response: { content: "a cube", model: request.modelId, provider: "cloudflare", finishReason: "stop" },
      };
    };

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    const events: StreamEvent[] = [];
    for await (const event of manager.stream({
      providerId: "gemini",
      modelId: "gemini-3.5-flash-lite",
      messages: [
        {
          role: "user",
          content: "what is this",
          parts: [{ type: "inline", mimeType: "image/png", data: "AA" }],
        },
      ],
      skipAvailabilityCheck: true,
    })) {
      events.push(event);
    }

    expect(attempted.filter((id) => id.startsWith("gemini:")).length).toBe(1);
    expect(attempted.some((id) => id.startsWith("cloudflare:"))).toBe(true);
    expect(events.find((event) => event.type === "complete")).toBeTruthy();
  });
});

describe("AIProviderManager per-turn platform quota", () => {
  beforeEach(() => {
    clearModelSkips();
    fakeGenerate.mockReset();
    consumePlatformChatQuota.mockReset();
    assertUnderSpendCeiling.mockReset();
    assertModelAvailable.mockResolvedValue({});
    listPublicModels.mockResolvedValue([
      { id: "gpt-4o-mini", providerId: "openai", name: "GPT-4o mini", capabilities: ["text"], enabled: true, available: true },
    ]);
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: providerId,
      apiKey: "test-platform-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));
  });

  it("charges one message once, however many providers it has to try", async () => {
    fakeGenerate
      .mockRejectedValueOnce(new AppError("Groq request failed", { statusCode: 502, code: "PROVIDER_ERROR" }))
      .mockResolvedValueOnce({ content: "fallback-ok", model: "gpt-4o-mini", provider: "openai", finishReason: "stop" });

    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager({ fallbackProviderId: "openai" });
    const result = await manager.generate({
      userId: "user-1",
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Hi" }],
    });

    expect(result.content).toBe("fallback-ok");
    expect(fakeGenerate).toHaveBeenCalledTimes(2);
    expect(consumePlatformChatQuota).toHaveBeenCalledTimes(1);
    expect(assertUnderSpendCeiling).toHaveBeenCalledTimes(1);
  });

  it("does not charge the platform allowance for a turn on the user's own key", async () => {
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: providerId,
      apiKey: "test-own-key-zzzz",
      enabled: true,
      configured: true,
      source: "user",
      capabilities: ["text"],
    }));
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const manager = new AIProviderManager();
    await manager.generate({
      userId: "user-1",
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messages: [{ role: "user", content: "Hi" }],
    });

    // getAdapter still asks, and the real limiter returns at once for "user".
    expect(consumePlatformChatQuota.mock.calls.every(([, source]) => source === "user")).toBe(true);
  });

  it("refuses an over-limit user without cooling the model down for everyone else", async () => {
    consumePlatformChatQuota.mockRejectedValueOnce(
      new AppError("Shared platform keys are rate-limited.", { statusCode: 429, code: "RATE_LIMITED" }),
    );
    const { AIProviderManager } = await import("./AIProviderManager.js");
    const { peekModelSkip } = await import("./modelSkip.js");
    const manager = new AIProviderManager({ fallbackProviderId: "openai" });

    await expect(
      manager.generate({
        userId: "user-1",
        providerId: "groq",
        modelId: "openai/gpt-oss-20b",
        messages: [{ role: "user", content: "Hi" }],
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(fakeGenerate).not.toHaveBeenCalled();
    expect(peekModelSkip("groq", "openai/gpt-oss-20b")).toBeUndefined();
  });
});

describe("AIProviderManager PDF delivery", () => {
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nstream\nBT (Refunds take 14 days) Tj ET\nendstream\nendobj\n%%EOF",
    "latin1",
  ).toString("base64");
  const withPdf = [
    {
      role: "user" as const,
      content: "What is the refund window?\n\nAttached file: policy.pdf (the PDF itself is attached)",
      parts: [{ type: "inline" as const, mimeType: "application/pdf", data: pdf, filename: "policy.pdf" }],
    },
  ];

  beforeEach(() => {
    clearModelSkips();
    fakeGenerate.mockReset();
    fakeGenerate.mockResolvedValue({ content: "ok", model: "m", provider: "p", finishReason: "stop" });
    assertModelAvailable.mockResolvedValue({});
    resolveCredentials.mockImplementation(async (providerId: string) => ({
      providerId,
      name: providerId,
      type: providerId,
      apiKey: "test-key-zzzz",
      enabled: true,
      configured: true,
      source: "environment",
      capabilities: ["text"],
    }));
  });

  const sentUserTurn = () => {
    const request = fakeGenerate.mock.calls[0]?.[0] as unknown as {
      messages: { role: string; content: string; parts?: unknown[] }[];
    };
    return request.messages.find((message) => message.role === "user");
  };

  it("gives a PDF-reading model the file alone, not its text as well", async () => {
    const { AIProviderManager } = await import("./AIProviderManager.js");
    await new AIProviderManager().generate({ providerId: "gemini", modelId: "gemini-3.5-flash-lite", messages: withPdf });

    expect(sentUserTurn()?.parts).toHaveLength(1);
    expect(sentUserTurn()?.content).not.toContain("Refunds take 14 days");
  });

  it("extracts the text when the turn reaches a model that cannot read the file", async () => {
    const { AIProviderManager } = await import("./AIProviderManager.js");
    await new AIProviderManager().generate({ providerId: "groq", modelId: "openai/gpt-oss-20b", messages: withPdf });

    expect(sentUserTurn()?.parts).toBeUndefined();
    expect(sentUserTurn()?.content).toContain("Refunds take 14 days");
  });
});
