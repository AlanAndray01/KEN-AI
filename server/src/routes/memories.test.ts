import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../utils/AppError.js";

const listMemories = vi.fn();
const createMemory = vi.fn();
const getInstructions = vi.fn();
const upsertInstructions = vi.fn();
const listGpts = vi.fn();
const createGpt = vi.fn();
const getAccessibleGpt = vi.fn();

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

vi.mock("../services/memory/memoryService.js", () => ({
  listMemories: (...args: unknown[]) => listMemories(...args),
  createMemory: (...args: unknown[]) => createMemory(...args),
  updateMemory: vi.fn(),
  deleteMemory: vi.fn(),
}));

vi.mock("../services/memory/instructionService.js", () => ({
  getInstructions: (...args: unknown[]) => getInstructions(...args),
  upsertInstructions: (...args: unknown[]) => upsertInstructions(...args),
}));

vi.mock("../services/gpts/gptService.js", () => ({
  listGpts: (...args: unknown[]) => listGpts(...args),
  createGpt: (...args: unknown[]) => createGpt(...args),
  getAccessibleGpt: (...args: unknown[]) => getAccessibleGpt(...args),
  updateGpt: vi.fn(),
  deleteGpt: vi.fn(),
}));

const memory = {
  id: "m1",
  content: "Prefers TypeScript",
  source: "manual",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const gpt = {
  id: "g1",
  name: "Writer",
  conversationStarters: [],
  knowledgeFileIds: [],
  capabilities: [],
  creatorId: "000000000000000000000001",
  visibility: "private",
  category: "writing",
  mine: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("memory, instruction, and GPT APIs", () => {
  beforeEach(() => {
    authRole = "user";
    listMemories.mockReset();
    createMemory.mockReset();
    getInstructions.mockReset();
    upsertInstructions.mockReset();
    listGpts.mockReset();
    createGpt.mockReset();
    getAccessibleGpt.mockReset();
    listMemories.mockResolvedValue([memory]);
    createMemory.mockResolvedValue(memory);
    getInstructions.mockResolvedValue({ aboutUser: "", howToRespond: "", additional: "", updatedAt: "2026-01-01T00:00:00.000Z" });
    upsertInstructions.mockResolvedValue({
      aboutUser: "Ada",
      howToRespond: "Be brief",
      additional: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    listGpts.mockResolvedValue([gpt]);
    createGpt.mockResolvedValue(gpt);
    getAccessibleGpt.mockResolvedValue({ public: gpt, doc: gpt });
  });

  it("requires auth for memories", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/memories");
    expect(response.status).toBe(401);
  });

  it("lists and creates memories", async () => {
    const { app } = await import("../app.js");
    const listed = await request(app).get("/api/memories");
    expect(listed.status).toBe(200);
    expect(listed.body.memories[0].content).toBe("Prefers TypeScript");
    const created = await request(app).post("/api/memories").send({ content: "Prefers TypeScript" });
    expect(created.status).toBe(201);
    expect(createMemory).toHaveBeenCalled();
  });

  it("saves custom instructions", async () => {
    const { app } = await import("../app.js");
    const saved = await request(app).put("/api/me/instructions").send({
      aboutUser: "Ada",
      howToRespond: "Be brief",
      additional: "",
    });
    expect(saved.status).toBe(200);
    expect(saved.body.instructions.aboutUser).toBe("Ada");
  });

  it("requires auth for GPT listing", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/gpts");
    expect(response.status).toBe(401);
  });

  it("requires auth to patch or delete a GPT", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const patched = await request(app).patch("/api/gpts/g1").send({ name: "Renamed" });
    expect(patched.status).toBe(401);
    const removed = await request(app).delete("/api/gpts/g1");
    expect(removed.status).toBe(401);
  });

  it("creates a GPT that persists through the builder API", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).post("/api/gpts").send({ name: "Writer", instructions: "Write clearly." });
    expect(response.status).toBe(201);
    expect(response.body.gpt.name).toBe("Writer");
    expect(createGpt).toHaveBeenCalled();
  });
});
