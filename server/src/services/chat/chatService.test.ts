import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/AppError.js";
import { clearModelSkips, rememberModelSkip } from "../ai/modelSkip.js";

const messages = new Map<string, Record<string, unknown>>();
const conversations = new Map<string, Record<string, unknown>>();

function withSave<T extends { _id: Types.ObjectId }>(doc: T) {
  const savable = doc as T & { save: () => Promise<T>; set: (key: string, value: unknown) => void };
  savable.save = async () => savable;
  savable.set = (key, value) => {
    (savable as Record<string, unknown>)[key] = value;
  };
  return savable;
}

vi.mock("../../models/Message.js", () => ({
  Message: {
    create: vi.fn(async (input: Record<string, unknown>) => {
      const created = withSave({
        _id: new Types.ObjectId(),
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      (created as { id: string }).id = String(created._id);
      messages.set(String(created._id), created as unknown as Record<string, unknown>);
      return created;
    }),
    find: vi.fn((query: { conversationId?: unknown }) => {
      const docs = [...messages.values()].filter((doc) => {
        if (query.conversationId && String(doc.conversationId) !== String(query.conversationId)) return false;
        return true;
      });
      return {
        sort: () => ({
          limit: async (count: number) => [...docs].slice(-count).reverse(),
        }),
      };
    }),
    findById: vi.fn(async (id: string) => messages.get(String(id)) ?? null),
    findOne: vi.fn(async () => null),
    updateOne: vi.fn(async () => ({})),
  },
}));

vi.mock("../../models/Conversation.js", () => ({
  Conversation: {
    create: vi.fn(async (input: Record<string, unknown>) => {
      const created = withSave({
        _id: new Types.ObjectId(),
        ...input,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      conversations.set(String(created._id), created as unknown as Record<string, unknown>);
      return created;
    }),
    findOne: vi.fn(async (query: { _id: string }) => conversations.get(String(query._id)) ?? null),
  },
}));

vi.mock("./conversationService.js", () => ({
  titleFromContent: (value: string) => value.slice(0, 60) || "New chat",
  capStoredTurns: vi.fn(async () => undefined),
  conversationExpiry: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  findOwnedConversation: async (_userId: string, conversationId: string) => {
    const found = conversations.get(conversationId);
    if (!found) {
      throw new AppError("Conversation not found", { statusCode: 404, code: "CONVERSATION_NOT_FOUND" });
    }
    return found;
  },
}));

vi.mock("../ai/ModelRegistry.js", () => ({
  modelRegistry: {
    listPublicModels: vi.fn(async () => []),
    assertModelAvailable: vi.fn(async () => ({
      id: "mock-text",
      providerId: "mock",
      name: "Mock Text",
      capabilities: ["text"],
      enabled: true,
      available: true,
      contextWindow: 8192,
    })),
  },
}));

const stream = vi.fn();
const generate = vi.fn();

vi.mock("../ai/AIProviderManager.js", () => ({
  aiProviderManager: {
    stream: (...args: unknown[]) => stream(...args),
    generate: (...args: unknown[]) => generate(...args),
    applyEnabledTools: vi.fn(async () => ({ systemMessages: [], files: [] })),
  },
}));

vi.mock("./usageService.js", () => ({
  recordUsage: vi.fn(async () => undefined),
}));

vi.mock("../storage/fileService.js", () => ({
  assertAttachmentsAllowed: vi.fn(),
  attachFilesToMessage: vi.fn(async () => []),
  loadOwnedFiles: vi.fn(async () => []),
  materializeFilesForModel: vi.fn(async () => ({ contentSuffix: "", parts: [] })),
  publicAttachmentsForMessages: vi.fn(async () => new Map()),
}));

vi.mock("../memory/persona.js", () => ({
  buildPersonaMessages: vi.fn(async () => []),
}));

vi.mock("../gpts/gptService.js", () => ({
  getAccessibleGpt: vi.fn(async () => ({ doc: {}, public: { id: "g1", mine: true } })),
}));

describe("chatService abort", () => {
  beforeEach(() => {
    messages.clear();
    conversations.clear();
    stream.mockReset();
    generate.mockReset();
    clearModelSkips();
  });

  it("keeps the partial assistant reply when generation is aborted", async () => {
    stream.mockImplementation(async function* () {
      yield { type: "start", model: "mock-text", provider: "mock" };
      yield { type: "chunk", text: "Hello par" };
      yield { type: "chunk", text: "tial" };
      const error = new Error("Aborted");
      error.name = "AbortError";
      throw error;
    });

    const { prepareSend, runGeneration } = await import("./chatService.js");
    const prepared = await prepareSend({
      userId: "000000000000000000000001",
      content: "Hi",
      providerId: "mock",
      modelId: "mock-text",
    });

    const events: Array<{ type: string; assistantMessage?: { content?: string; status?: string } }> = [];
    await runGeneration(prepared, (event) => events.push(event), "test");

    const aborted = events.find((event) => event.type === "aborted");
    expect(aborted?.assistantMessage?.content).toBe("Hello partial");
    expect(aborted?.assistantMessage?.status).toBe("aborted");
    const input = stream.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
      skipAvailabilityCheck?: boolean;
      maxTokens?: number;
    };
    expect(input.messages[0]?.content).toContain("You are Ken AI");
    expect(input.messages[1]?.content).toContain("Ken reply policy");
    expect(input).toMatchObject({ skipAvailabilityCheck: true, maxTokens: 256, reasoningEffort: "none" });
  });

  it("asks for low thinking on a short factual question and surfaces a hop", async () => {
    stream.mockImplementation(async function* () {
      yield {
        type: "fallback",
        model: "gemini-3.5-flash-lite",
        provider: "gemini",
        fallbackFrom: "gemini-3.8-flash",
        fallbackReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
      };
      yield { type: "connected", model: "gemini-3.5-flash-lite", provider: "gemini", connectMs: 80 };
      yield { type: "chunk", text: "There is" };
      yield {
        type: "complete",
        response: { content: "There is", model: "gemini-3.5-flash-lite", provider: "gemini" },
      };
    });

    const { prepareSend, runGeneration } = await import("./chatService.js");
    const prepared = await prepareSend({
      userId: "000000000000000000000001",
      content: "So Whose the father of science?",
      providerId: "mock",
      modelId: "mock-text",
    });

    const events: Array<{ type: string; activeModel?: string; fallbackFrom?: string; firstVisibleChunkMs?: number }> =
      [];
    await runGeneration(prepared, (event) => events.push(event), "test", undefined, {
      requestId: "5dd687df-c1e0-4eb3-8b5d-3433d9ce24b8",
      startedAt: Date.now() - 259,
    });

    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      maxTokens: 1024,
      reasoningEffort: "none",
      requestId: "5dd687df-c1e0-4eb3-8b5d-3433d9ce24b8",
    });
    expect(events.find((event) => event.type === "model")).toMatchObject({
      type: "model",
      activeModel: "gemini-3.5-flash-lite",
      fallbackFrom: "gemini-3.8-flash",
      fallbackReason: "PROVIDER_RATE_LIMITED|429|quota_exceeded",
    });
    const timings = events.filter((event) => event.type === "timing");
    expect(timings.length).toBeGreaterThanOrEqual(3);
    expect(timings.some((event) => event.fallbackFrom === "gemini-3.8-flash")).toBe(true);
    expect(timings.some((event) => event.firstVisibleChunkMs !== undefined)).toBe(true);
    expect(events.find((event) => event.type === "complete")).toBeTruthy();
  });

  it("starts on Lite immediately when 3.8 is quota-skipped, without removing 3.8 from the conversation", async () => {
    rememberModelSkip(
      "gemini",
      "gemini-3.8-flash",
      new AppError("Provider rate limit reached.", {
        statusCode: 429,
        code: "PROVIDER_RATE_LIMITED",
        extra: { httpStatus: 429, errorClass: "quota_exceeded" },
      }),
    );
    stream.mockImplementation(async function* (request: { modelId: string }) {
      yield { type: "chunk", text: "Glad to" };
      yield {
        type: "complete",
        response: { content: "Glad to hear it.", model: request.modelId, provider: "gemini" },
      };
    });

    const { prepareSend, runGeneration } = await import("./chatService.js");
    const prepared = await prepareSend({
      userId: "000000000000000000000001",
      content: "Great",
      providerId: "gemini",
      modelId: "gemini-3.8-flash",
    });
    prepared.providerId = "gemini";
    prepared.modelId = "gemini-3.8-flash";
    prepared.conversation.modelId = "gemini-3.8-flash";
    prepared.conversation.providerId = "gemini";
    prepared.assistantMessage.model = "gemini-3.8-flash";
    prepared.assistantMessage.provider = "gemini";

    const events: Array<{
      type: string;
      assistantMessage?: { model?: string };
      conversation?: { modelId?: string };
      activeModel?: string;
    }> = [];
    await runGeneration(prepared, (event) => events.push(event), "test", undefined, {
      requestId: "e87c3929-12de-455b-b90f-98443f9d3299",
    });

    expect(events.find((event) => event.type === "start")).toMatchObject({
      assistantMessage: { model: "gemini-3.5-flash-lite" },
      conversation: { modelId: "gemini-3.8-flash" },
    });
    expect(events.find((event) => event.type === "model")).toMatchObject({
      activeModel: "gemini-3.5-flash-lite",
      fallbackFrom: "gemini-3.8-flash",
    });
    expect(stream.mock.calls[0]?.[0]).toMatchObject({
      providerId: "gemini",
      modelId: "gemini-3.5-flash-lite",
    });
  });
});

describe("chatService automatic titles", () => {
  beforeEach(() => {
    messages.clear();
    conversations.clear();
    stream.mockReset();
    generate.mockReset();
    stream.mockImplementation(async function* () {
      yield { type: "start", model: "mock-text", provider: "mock" };
      yield { type: "chunk", text: "Photosynthesis converts light into sugar." };
      yield {
        type: "complete",
        response: { content: "Photosynthesis converts light into sugar.", model: "mock-text", provider: "mock" },
      };
    });
  });

  async function send(content: string) {
    const { prepareSend, runGeneration } = await import("./chatService.js");
    const prepared = await prepareSend({
      userId: "000000000000000000000001",
      content,
      providerId: "mock",
      modelId: "mock-text",
    });
    const events: Array<{ type: string; conversation?: { title?: string } }> = [];
    await runGeneration(prepared, (event) => events.push(event), "test");
    return { events, conversation: conversations.get(prepared.conversationId) };
  }

  it("replaces the placeholder title with the model's after the stream has closed", async () => {
    generate.mockResolvedValue({ content: '"Photosynthesis Basics"' });

    const { events, conversation } = await send("explain photosynthesis to me yaar");

    // Complete must not wait on naming: that second Groq call used to keep the
    // SSE open after the user already had the full reply.
    expect(events.find((event) => event.type === "complete")?.conversation?.title).not.toBe(
      "Photosynthesis Basics",
    );
    await vi.waitFor(() => {
      expect(conversation?.title).toBe("Photosynthesis Basics");
      expect(conversation?.titleSource).toBe("model");
    });
  });

  it("never spends the user's shared-key chat quota on naming", async () => {
    generate.mockResolvedValue({ content: "Photosynthesis Basics" });
    await send("explain photosynthesis");
    await vi.waitFor(() => {
      expect(generate.mock.calls[0]?.[0]).toMatchObject({ skipQuota: true, maxTokens: 128 });
    });
  });

  it("keeps the placeholder when the naming call fails", async () => {
    generate.mockRejectedValue(new Error("provider down"));

    const { conversation } = await send("explain photosynthesis");

    await vi.waitFor(() => {
      expect(generate).toHaveBeenCalled();
    });
    expect(conversation?.title).toBe("explain photosynthesis");
    expect(conversation?.titleSource).toBe("auto");
  });

  it("leaves a title the user typed alone", async () => {
    generate.mockResolvedValue({ content: "Photosynthesis Basics" });
    const { prepareSend, runGeneration } = await import("./chatService.js");
    const prepared = await prepareSend({
      userId: "000000000000000000000001",
      content: "explain photosynthesis",
      providerId: "mock",
      modelId: "mock-text",
    });
    const conversation = conversations.get(prepared.conversationId)!;
    conversation.title = "Bio homework";
    conversation.titleSource = "user";

    await runGeneration(prepared, () => undefined, "test");

    expect(conversation.title).toBe("Bio homework");
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("chatService attachments", () => {
  beforeEach(() => {
    messages.clear();
    conversations.clear();
    stream.mockReset();
    clearModelSkips();
  });

  it("sends image parts even when preloaded history missed the new turn", async () => {
    const { loadOwnedFiles, materializeFilesForModel } = await import("../storage/fileService.js");
    vi.mocked(loadOwnedFiles).mockResolvedValue([
      {
        _id: new Types.ObjectId(),
        originalName: "shot.png",
        mimeType: "image/png",
        storageKey: "user/shot",
      } as never,
    ]);
    vi.mocked(materializeFilesForModel).mockResolvedValue({
      contentSuffix: "Attached file: shot.png",
      parts: [{ type: "inline", mimeType: "image/png", data: "AAAA" }],
    });
    stream.mockImplementation(async function* () {
      yield { type: "chunk", text: "A diagram" };
      yield { type: "complete", response: { content: "A diagram", model: "mock-text", provider: "mock" } };
    });

    const { prepareSend, runGeneration } = await import("./chatService.js");
    const prepared = await prepareSend({
      userId: "000000000000000000000001",
      content: "what is this",
      providerId: "mock",
      modelId: "mock-text",
    });
    prepared.userMessage = {
      ...prepared.userMessage,
      attachments: [
        {
          id: "att1",
          fileId: "file1",
          originalName: "shot.png",
          mimeType: "image/png",
          size: 12,
          kind: "image",
        },
      ],
    };

    await runGeneration(prepared, () => undefined, "test", {
      history: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "Hi" },
      ],
      persona: [],
    });

    const input = stream.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string; parts?: Array<{ mimeType: string }> }>;
    };
    const lastUser = [...(input.messages ?? [])].reverse().find((message) => message.role === "user");
    expect(lastUser?.content).toContain("shot.png");
    expect(lastUser?.parts).toEqual([{ type: "inline", mimeType: "image/png", data: "AAAA" }]);
  });
});
