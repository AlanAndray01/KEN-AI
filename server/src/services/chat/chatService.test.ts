import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/AppError.js";

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

vi.mock("../ai/AIProviderManager.js", () => ({
  aiProviderManager: {
    stream: (...args: unknown[]) => stream(...args),
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
    const input = stream.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    expect(input.messages[0]?.content).toContain("Ken reply policy");
  });
});
