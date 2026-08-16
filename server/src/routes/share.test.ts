import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../utils/AppError.js";

const createShare = vi.fn();
const getShare = vi.fn();
const revokeShare = vi.fn();
const getPublicShare = vi.fn();
const exportConversation = vi.fn();

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

vi.mock("../services/share/shareService.js", () => ({
  createShare: (...args: unknown[]) => createShare(...args),
  getShare: (...args: unknown[]) => getShare(...args),
  revokeShare: (...args: unknown[]) => revokeShare(...args),
  getPublicShare: (...args: unknown[]) => getPublicShare(...args),
}));

vi.mock("../services/export/exportService.js", () => ({
  exportConversation: (...args: unknown[]) => exportConversation(...args),
  exportAllConversations: vi.fn(),
}));

const share = {
  id: "s1",
  conversationId: "c1",
  token: "share-token-value",
  url: "http://localhost:5173/share/share-token-value",
  isReadOnly: true,
  revoked: false,
  viewCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("share and export APIs", () => {
  beforeEach(() => {
    authRole = "user";
    createShare.mockReset();
    getShare.mockReset();
    revokeShare.mockReset();
    getPublicShare.mockReset();
    exportConversation.mockReset();
    createShare.mockResolvedValue(share);
    getShare.mockResolvedValue(share);
    revokeShare.mockResolvedValue(undefined);
    getPublicShare.mockResolvedValue({
      title: "Hello",
      createdAt: "2026-01-01T00:00:00.000Z",
      messages: [{ role: "user", content: "Hi", createdAt: "2026-01-01T00:00:00.000Z" }],
    });
    exportConversation.mockResolvedValue({
      filename: "Hello.md",
      mimeType: "text/markdown; charset=utf-8",
      body: "# Hello\n\n**User**\n\nHi\n",
    });
  });

  it("requires auth to create a share link", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).post("/api/conversations/c1/share");
    expect(response.status).toBe(401);
  });

  it("creates a read-only share link for the owner", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).post("/api/conversations/c1/share");
    expect(response.status).toBe(201);
    expect(response.body.share.isReadOnly).toBe(true);
    expect(response.body.share.token).toBe("share-token-value");
    expect(response.body.share.url).toContain("/share/");
  });

  it("returns a public read-only snapshot without auth", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/share/share-token-value");
    expect(response.status).toBe(200);
    expect(response.body.readOnly).toBe(true);
    expect(response.body.conversation.messages[0].content).toBe("Hi");
    expect(JSON.stringify(response.body)).not.toContain("password");
    expect(JSON.stringify(response.body)).not.toContain("apiKey");
  });

  it("returns 404 for a revoked share token", async () => {
    getPublicShare.mockRejectedValue(
      new AppError("Share link not found", { statusCode: 404, code: "SHARE_NOT_FOUND" }),
    );
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/share/revoked-token");
    expect(response.status).toBe(404);
  });

  it("requires auth to export a conversation", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/conversations/c1/export?format=md");
    expect(response.status).toBe(401);
  });

  it("exports markdown for the owner", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/conversations/c1/export?format=md");
    expect(response.status).toBe(200);
    expect(response.headers["content-disposition"]).toContain("Hello.md");
    expect(response.text).toContain("# Hello");
    expect(response.text).toContain("Hi");
  });

  it("exports json and txt for the owner", async () => {
    exportConversation
      .mockResolvedValueOnce({
        filename: "Hello.json",
        mimeType: "application/json; charset=utf-8",
        body: '{"conversations":[]}\n',
      })
      .mockResolvedValueOnce({
        filename: "Hello.txt",
        mimeType: "text/plain; charset=utf-8",
        body: "Hello\n\nUser\nHi\n",
      });
    const { app } = await import("../app.js");
    const json = await request(app).get("/api/conversations/c1/export?format=json");
    expect(json.status).toBe(200);
    expect(json.headers["content-type"]).toContain("application/json");
    const txt = await request(app).get("/api/conversations/c1/export?format=txt");
    expect(txt.status).toBe(200);
    expect(txt.text).toContain("Hello");
  });
});
