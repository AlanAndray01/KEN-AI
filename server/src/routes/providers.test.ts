import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../utils/AppError.js";

const listPublicModels = vi.fn();
const listPublicProviders = vi.fn();
const listAdminProviders = vi.fn();
const createProvider = vi.fn();
const testProviderConnection = vi.fn();
const testUserCredential = vi.fn();
const listAdminModels = vi.fn();

let authRole: "admin" | "user" | null = "admin";

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

vi.mock("../services/ai/ModelRegistry.js", () => ({
  modelRegistry: {
    listPublicModels: (...args: unknown[]) => listPublicModels(...args),
    listAllModels: (...args: unknown[]) => listPublicModels(...args),
    assertModelAvailable: vi.fn(),
  },
}));

vi.mock("../services/ai/providerService.js", () => ({
  listPublicProviders: (...args: unknown[]) => listPublicProviders(...args),
  listAdminProviders: (...args: unknown[]) => listAdminProviders(...args),
  createProvider: (...args: unknown[]) => createProvider(...args),
  deleteProvider: vi.fn(),
  deleteUserCredential: vi.fn(),
  listAdminModels: (...args: unknown[]) => listAdminModels(...args),
  listUserCredentials: vi.fn(async () => []),
  patchModel: vi.fn(),
  testProviderConnection: (...args: unknown[]) => testProviderConnection(...args),
  testUserCredential: (...args: unknown[]) => testUserCredential(...args),
  updateProvider: vi.fn(),
  upsertUserCredential: vi.fn(),
}));

function assertNoRawApiKeys(payload: unknown): void {
  const json = JSON.stringify(payload);
  expect(json).not.toContain("encryptedApiKey");
  expect(json).not.toMatch(/"apiKey"\s*:\s*"(?!••••)[^"]+"/);
  expect(json).not.toContain("x-goog-api-key");
  expect(json).not.toContain("test-secret-key-abcd");
}

const geminiProvider = {
  id: "gemini",
  providerId: "gemini",
  name: "Google Gemini",
  type: "gemini",
  enabled: true,
  configured: true,
  keyLastFour: "zzzz",
  capabilities: ["text", "streaming"],
  source: "environment",
};

describe("provider configuration APIs", () => {
  beforeEach(async () => {
    authRole = "admin";
    listPublicModels.mockReset();
    listPublicProviders.mockReset();
    listAdminProviders.mockReset();
    createProvider.mockReset();
    testProviderConnection.mockReset();
    testUserCredential.mockReset();
    listAdminModels.mockReset();
    listPublicModels.mockResolvedValue([
      {
        id: "gemini-2.5-flash",
        providerId: "gemini",
        name: "Gemini 2.5 Flash",
        capabilities: ["text", "streaming"],
        enabled: true,
        available: true,
      },
    ]);
    listPublicProviders.mockResolvedValue([geminiProvider]);
    listAdminProviders.mockResolvedValue([geminiProvider]);
    listAdminModels.mockResolvedValue([
      {
        id: "gemini-2.5-flash",
        providerId: "gemini",
        name: "Gemini 2.5 Flash",
        capabilities: ["text"],
        enabled: true,
        available: true,
      },
    ]);
  });

  it("requires auth for GET /api/models", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/models");
    expect(response.status).toBe(401);
  });

  it("requires auth for GET /api/providers", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/providers");
    expect(response.status).toBe(401);
  });

  it("returns public models without secrets", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/models");
    expect(response.status).toBe(200);
    expect(response.body.models[0].id).toBe("gemini-2.5-flash");
    assertNoRawApiKeys(response.body);
  });

  it("rejects non-admin access to provider configuration", async () => {
    authRole = "user";
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/admin/providers");
    expect(response.status).toBe(403);
  });

  it("never echoes a submitted API key from admin create", async () => {
    createProvider.mockResolvedValue({
      ...geminiProvider,
      providerId: "custom",
      name: "Custom",
      type: "openai-compatible",
      keyLastFour: "abcd",
      source: "database",
    });
    const { app } = await import("../app.js");
    const response = await request(app)
      .post("/api/admin/providers")
      .send({
        name: "Custom",
        type: "openai-compatible",
        baseUrl: "https://example.com/v1",
        apiKey: "test-secret-key-abcd",
      });

    expect(response.status).toBe(201);
    assertNoRawApiKeys(response.body);
    expect(response.body.provider.keyLastFour).toBe("abcd");
  });

  it("returns masked provider status from admin list", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).get("/api/admin/providers");
    expect(response.status).toBe(200);
    expect(response.body.providers[0].configured).toBe(true);
    assertNoRawApiKeys(response.body);
  });

  it("tests a user-supplied key without echoing it", async () => {
    authRole = "user";
    testUserCredential.mockResolvedValue({ status: "connected", message: "Connected" });
    const { app } = await import("../app.js");
    const response = await request(app)
      .post("/api/me/provider-credentials/groq/test")
      .send({ apiKey: "test-secret-key-abcd" });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("connected");
    expect(testUserCredential).toHaveBeenCalledWith(
      "000000000000000000000001",
      "groq",
      expect.objectContaining({ apiKey: "test-secret-key-abcd" }),
    );
    assertNoRawApiKeys(response.body);
  });
});
