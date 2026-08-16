import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../utils/AppError.js";

const listConversations = vi.fn();
const createConversation = vi.fn();
const getConversation = vi.fn();
const listMessages = vi.fn();
const prepareSend = vi.fn();
const runGeneration = vi.fn();
const abortGeneration = vi.fn();

let authRole: "admin" | "user" | null = "user";

vi.mock("../middleware/requireAuth.js", () => ({
  requireAuth: (req: { auth?: unknown }, _res: unknown, next: (error?: unknown) => void) => {
    if (!authRole) {
      next(new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" }));
      return;
    }
    req.auth = {
      userId: "000000000000000000000001",
      sessionId: "000000000000000000000002",
      role: authRole,
      user: {
        id: "000000000000000000000001",
        name: "Ada",
        email: "ada@example.com",
        role: authRole,
        preferences: { theme: "system", language: "en", sendOnEnter: true },
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };
    next();
  },
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../services/chat/conversationService.js", () => ({
  listConversations: (...args: unknown[]) => listConversations(...args),
  createConversation: (...args: unknown[]) => createConversation(...args),
  getConversation: (...args: unknown[]) => getConversation(...args),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  listMessages: (...args: unknown[]) => listMessages(...args),
  setMessageFeedback: vi.fn(),
  findOwnedConversation: vi.fn(),
  titleFromContent: (value: string) => value.slice(0, 60),
}));

vi.mock("../services/chat/chatService.js", () => ({
  prepareSend: (...args: unknown[]) => prepareSend(...args),
  prepareRegenerate: vi.fn(),
  runGeneration: (...args: unknown[]) => runGeneration(...args),
  abortGeneration: (...args: unknown[]) => abortGeneration(...args),
}));

const conversation = {
  id: "c1",
  title: "Hello",
  modelId: "gemini-2.5-flash",
  providerId: "gemini",
  archived: false,
  pinned: false,
  messageCount: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("conversation APIs", () => {
  beforeEach(() => {
    authRole = "user";
    listConversations.mockReset();
    createConversation.mockReset();
    getConversation.mockReset();
    listMessages.mockReset();
    prepareSend.mockReset();
    runGeneration.mockReset();
    abortGeneration.mockReset();
    listConversations.mockResolvedValue([conversation]);
    createConversation.mockResolvedValue(conversation);
    getConversation.mockResolvedValue(conversation);
    listMessages.mockResolvedValue([
      {
        id: "m1",
        conversationId: "c1",
        role: "user",
        content: "Hi",
        status: "complete",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("requires auth for conversation list", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/conversations");
    expect(response.status).toBe(401);
  });

  it("requires auth to send a chat message", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const conversationMessage = await request(app).post("/api/conversations/c1/messages").send({ content: "Hi" });
    expect(conversationMessage.status).toBe(401);
    const chat = await request(app).post("/api/chat").send({ content: "Hi" });
    expect(chat.status).toBe(401);
  });

  it("lists conversations for the current user", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/conversations");
    expect(response.status).toBe(200);
    expect(response.body.conversations[0].title).toBe("Hello");
  });

  it("streams chat events and can abort", async () => {
    prepareSend.mockResolvedValue({
      userId: "000000000000000000000001",
      conversationId: "c1",
      generationId: "g1",
      providerId: "gemini",
      modelId: "gemini-2.5-flash",
      userMessage: { id: "u1", role: "user", content: "Hi" },
      assistantMessage: { id: "a1", role: "assistant", content: "", status: "streaming" },
      conversation,
      abortSignal: new AbortController().signal,
    });
    runGeneration.mockImplementation(async (_prepared, emit: (event: { type: string; text?: string }) => void) => {
      emit({ type: "start" });
      emit({ type: "chunk", text: "Hello" });
      emit({ type: "complete" });
    });
    abortGeneration.mockReturnValue(true);

    const { app } = await import("../app.js");
    const stream = await request(app).post("/api/conversations/c1/messages").send({ content: "Hi" });
    expect(stream.status).toBe(200);
    expect(stream.headers["content-type"]).toContain("text/event-stream");
    expect(stream.text).toContain("Hello");

    const aborted = await request(app).post("/api/conversations/c1/generation/abort").send({});
    expect(aborted.status).toBe(200);
    expect(aborted.body.aborted).toBe(true);
  });
});
