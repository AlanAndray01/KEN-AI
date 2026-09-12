import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../utils/AppError.js";

const listNotifications = vi.fn();
const markNotificationRead = vi.fn();
const markAllNotificationsRead = vi.fn();
const updateProfile = vi.fn();
const summarizeUsage = vi.fn();
const exportAllConversations = vi.fn();

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
  requireAdmin: (req: { auth?: { role?: string } }, _res: unknown, next: (error?: unknown) => void) => {
    if (req.auth?.role !== "admin") {
      next(new AppError("Administrator access required", { statusCode: 403, code: "FORBIDDEN" }));
      return;
    }
    next();
  },
}));

vi.mock("../services/notifications/notificationService.js", () => ({
  listNotifications: (...args: unknown[]) => listNotifications(...args),
  markNotificationRead: (...args: unknown[]) => markNotificationRead(...args),
  markAllNotificationsRead: (...args: unknown[]) => markAllNotificationsRead(...args),
  createNotification: vi.fn(),
}));

vi.mock("../services/auth/authService.js", async () => {
  const actual = await vi.importActual<typeof import("../services/auth/authService.js")>(
    "../services/auth/authService.js",
  );
  return {
    ...actual,
    updateProfile: (...args: unknown[]) => updateProfile(...args),
  };
});

vi.mock("../services/chat/usageService.js", () => ({
  recordUsage: vi.fn(),
  summarizeUsage: (...args: unknown[]) => summarizeUsage(...args),
}));

vi.mock("../services/export/exportService.js", () => ({
  exportConversation: vi.fn(),
  exportAllConversations: (...args: unknown[]) => exportAllConversations(...args),
}));

describe("notifications, profile, and usage APIs", { timeout: 15_000 }, () => {
  beforeEach(() => {
    authRole = "user";
    listNotifications.mockReset();
    markNotificationRead.mockReset();
    markAllNotificationsRead.mockReset();
    updateProfile.mockReset();
    summarizeUsage.mockReset();
    exportAllConversations.mockReset();
    listNotifications.mockResolvedValue([]);
    updateProfile.mockResolvedValue({
      id: "000000000000000000000001",
      name: "Ada Lovelace",
      email: "ada@example.com",
      role: "user",
      preferences: { theme: "system", language: "en", sendOnEnter: false },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    summarizeUsage.mockResolvedValue({
      totals: { requests: 0, inputTokens: 0, outputTokens: 0, successes: 0, failures: 0 },
      byProvider: [],
      byModel: [],
      recent: [],
    });
  });

  it("lists an empty notification inbox honestly", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/notifications");
    expect(response.status).toBe(200);
    expect(response.body.notifications).toEqual([]);
  });

  it("requires auth for notifications", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/notifications");
    expect(response.status).toBe(401);
  });

  it("updates profile preferences", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).patch("/api/me").send({
      name: "Ada Lovelace",
      preferences: { sendOnEnter: false },
    });
    expect(response.status).toBe(200);
    expect(response.body.user.name).toBe("Ada Lovelace");
    expect(response.body.user.preferences.sendOnEnter).toBe(false);
  });

  it("returns 403 for non-admin usage", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/admin/usage");
    expect(response.status).toBe(403);
  });

  it("returns real usage totals for admins", async () => {
    authRole = "admin";
    summarizeUsage.mockResolvedValue({
      totals: { requests: 2, inputTokens: 10, outputTokens: 20, successes: 2, failures: 0 },
      byProvider: [
        {
          key: "gemini",
          providerId: "gemini",
          requests: 2,
          inputTokens: 10,
          outputTokens: 20,
          successes: 2,
          failures: 0,
        },
      ],
      byModel: [],
      recent: [],
    });
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/admin/usage");
    expect(response.status).toBe(200);
    expect(response.body.usage.totals.requests).toBe(2);
    expect(response.body.usage.byProvider[0].providerId).toBe("gemini");
  });
});
