import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../utils/AppError.js";

const listConversations = vi.fn();
const createConversation = vi.fn();
const getConversation = vi.fn();
const listMessages = vi.fn();
const setMessageFeedback = vi.fn();
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
  setMessageFeedback: (...args: unknown[]) => setMessageFeedback(...args),
  findOwnedConversation: vi.fn(),
  titleFromContent: (value: string) => value.slice(0, 60),
}));

vi.mock("../services/chat/chatService.js", () => ({
  prepareSend: (...args: unknown[]) => prepareSend(...args),
  prepareRegenerate: vi.fn(),
  runGeneration: (...args: unknown[]) => runGeneration(...args),
  abortGeneration: (...args: unknown[]) => abortGeneration(...args),
  loadHistory: vi.fn(async () => []),
}));

vi.mock("../services/memory/persona.js", () => ({
  buildPersonaMessages: vi.fn(async () => []),
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
    setMessageFeedback.mockReset();
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

  it("writes SSE headers before prepareSend resolves", async () => {
    let releasePrepare: (value: unknown) => void = () => undefined;
    prepareSend.mockImplementation(
      () =>
        new Promise((resolve) => {
          releasePrepare = resolve;
        }),
    );
    runGeneration.mockImplementation(async (_prepared, emit: (event: { type: string }) => void) => {
      emit({ type: "complete" });
    });

    const { sendChatHandler } = await import("../controllers/chatController.js");
    const flushHeaders = vi.fn();
    const res = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      flushHeaders,
      write: vi.fn(),
      end: vi.fn(),
      writableEnded: false,
      socket: { setNoDelay: vi.fn() },
    };
    const req = {
      body: { content: "Hi" },
      auth: { userId: "000000000000000000000001" },
      params: {},
      on: vi.fn(),
      off: vi.fn(),
    };

    const done = sendChatHandler(req as never, res as never);
    await vi.waitFor(() => expect(flushHeaders).toHaveBeenCalled());
    expect(runGeneration).not.toHaveBeenCalled();

    releasePrepare({
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

    await done;
    expect(runGeneration).toHaveBeenCalled();
    expect(res.end).toHaveBeenCalled();
  });

  it("emits an SSE error when prepareSend fails after headers are flushed", async () => {
    prepareSend.mockRejectedValue(new AppError("Model unavailable", { statusCode: 404, code: "MODEL_UNAVAILABLE" }));
    const { app } = await import("../app.js");
    const stream = await request(app).post("/api/chat").send({ content: "Hi" });
    expect(stream.status).toBe(200);
    expect(stream.headers["content-type"]).toContain("text/event-stream");
    expect(stream.text).toContain("MODEL_UNAVAILABLE");
  });

  describe("message feedback", () => {
    const ratedMessage = {
      id: "a1",
      conversationId: "c1",
      role: "assistant",
      content: "Hello there",
      status: "complete",
      feedback: { rating: "up" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    it("stores a positive rating and returns the updated message", async () => {
      setMessageFeedback.mockResolvedValue(ratedMessage);
      const { app } = await import("../app.js");

      const response = await request(app)
        .post("/api/conversations/c1/messages/a1/feedback")
        .send({ rating: "up" });

      expect(response.status).toBe(200);
      expect(response.body.message.feedback).toEqual({ rating: "up" });
      expect(setMessageFeedback).toHaveBeenCalledWith(
        "000000000000000000000001",
        "c1",
        "a1",
        { rating: "up" },
      );
    });

    it("stores a negative rating", async () => {
      setMessageFeedback.mockResolvedValue({ ...ratedMessage, feedback: { rating: "down" } });
      const { app } = await import("../app.js");

      const response = await request(app)
        .post("/api/conversations/c1/messages/a1/feedback")
        .send({ rating: "down" });

      expect(response.status).toBe(200);
      expect(response.body.message.feedback).toEqual({ rating: "down" });
    });

    it("accepts a repeated identical rating idempotently", async () => {
      setMessageFeedback.mockResolvedValue(ratedMessage);
      const { app } = await import("../app.js");

      const first = await request(app).post("/api/conversations/c1/messages/a1/feedback").send({ rating: "up" });
      const second = await request(app).post("/api/conversations/c1/messages/a1/feedback").send({ rating: "up" });

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(second.body.message.feedback).toEqual({ rating: "up" });
    });

    it("rejects an unauthenticated rating", async () => {
      authRole = null;
      const { app } = await import("../app.js");

      const response = await request(app)
        .post("/api/conversations/c1/messages/a1/feedback")
        .send({ rating: "up" });

      expect(response.status).toBe(401);
      expect(setMessageFeedback).not.toHaveBeenCalled();
    });

    it("rejects an invalid rating value before touching the database", async () => {
      const { app } = await import("../app.js");

      const response = await request(app)
        .post("/api/conversations/c1/messages/a1/feedback")
        .send({ rating: "excellent" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("VALIDATION_ERROR");
      expect(setMessageFeedback).not.toHaveBeenCalled();
    });

    it("surfaces a 404 for a message the user does not own", async () => {
      setMessageFeedback.mockRejectedValue(
        new AppError("Message not found", { statusCode: 404, code: "MESSAGE_NOT_FOUND" }),
      );
      const { app } = await import("../app.js");

      const response = await request(app)
        .post("/api/conversations/c1/messages/a1/feedback")
        .send({ rating: "up" });

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("MESSAGE_NOT_FOUND");
    });

    it("404s when the conversation id is missing from the path", async () => {
      const { app } = await import("../app.js");

      const response = await request(app)
        .post("/api/conversations//messages/a1/feedback")
        .send({ rating: "up" });

      expect(response.status).toBe(404);
      expect(setMessageFeedback).not.toHaveBeenCalled();
    });
  });
});
