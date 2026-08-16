import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../utils/AppError.js";

const listTools = vi.fn();
const runTool = vi.fn();
const getAnalysisJob = vi.fn();
const transcribe = vi.fn();
const speak = vi.fn();
const sttConfigured = vi.fn();
const ttsConfigured = vi.fn();
const unavailableReason = vi.fn();

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

vi.mock("../services/ai/AIProviderManager.js", () => ({
  aiProviderManager: {
    listTools: (...args: unknown[]) => listTools(...args),
    runTool: (...args: unknown[]) => runTool(...args),
    getAnalysisJob: (...args: unknown[]) => getAnalysisJob(...args),
  },
}));

vi.mock("../services/ai/ModelRegistry.js", () => ({
  modelRegistry: {
    assertModelAvailable: vi.fn(async () => ({
      id: "gemini-2.5-flash",
      providerId: "gemini",
      capabilities: ["text", "streaming", "tools"],
    })),
  },
}));

vi.mock("../services/voice/index.js", () => ({
  voiceService: {
    id: "none",
    sttConfigured: () => sttConfigured(),
    ttsConfigured: () => ttsConfigured(),
    unavailableReason: () => unavailableReason(),
    transcribe: (...args: unknown[]) => transcribe(...args),
    speak: (...args: unknown[]) => speak(...args),
  },
}));

describe("tool, voice, and analysis APIs", () => {
  beforeEach(() => {
    authRole = "user";
    listTools.mockReset();
    runTool.mockReset();
    getAnalysisJob.mockReset();
    transcribe.mockReset();
    speak.mockReset();
    sttConfigured.mockReset();
    ttsConfigured.mockReset();
    unavailableReason.mockReset();
    listTools.mockReturnValue([
      {
        id: "web_search",
        name: "Web search",
        description: "Search",
        configured: false,
        available: false,
        unavailableReason: "Web search is not configured.",
      },
    ]);
    sttConfigured.mockReturnValue(false);
    ttsConfigured.mockReturnValue(false);
    unavailableReason.mockReturnValue("Voice is not configured.");
    runTool.mockRejectedValue(
      new AppError("Web search is not configured.", { statusCode: 503, code: "SEARCH_NOT_CONFIGURED", expose: true }),
    );
  });

  it("requires auth for tool listing", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/tools");
    expect(response.status).toBe(401);
  });

  it("lists tools for the current user", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/tools");
    expect(response.status).toBe(200);
    expect(response.body.tools[0].id).toBe("web_search");
    expect(response.body.tools[0].configured).toBe(false);
  });

  it("returns SEARCH_NOT_CONFIGURED instead of fake hits", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).post("/api/tools/search").send({ query: "latest news" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("SEARCH_NOT_CONFIGURED");
  });

  it("returns ANALYSIS_SANDBOX_NOT_CONFIGURED instead of running code", async () => {
    runTool.mockRejectedValue(
      new AppError("Isolated data-analysis sandbox is not configured. Code is never executed inside the API process.", {
        statusCode: 503,
        code: "ANALYSIS_SANDBOX_NOT_CONFIGURED",
        expose: true,
      }),
    );
    const { app } = await import("../app.js");
    const response = await request(app).post("/api/analysis/jobs").send({ code: "print(1)" });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("ANALYSIS_SANDBOX_NOT_CONFIGURED");
  });

  it("requires auth for voice status", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/voice/status");
    expect(response.status).toBe(401);
  });

  it("reports unconfigured voice without faking transcripts", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/voice/status");
    expect(response.status).toBe(200);
    expect(response.body.sttConfigured).toBe(false);
    expect(response.body.ttsConfigured).toBe(false);
  });
});
