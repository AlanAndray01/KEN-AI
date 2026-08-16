import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { AppError } from "../utils/AppError.js";

const uploadUserFile = vi.fn();
const listUserFiles = vi.fn();
const readOwnedFile = vi.fn();
const deleteOwnedFile = vi.fn();

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

vi.mock("../services/storage/fileService.js", () => ({
  uploadUserFile: (...args: unknown[]) => uploadUserFile(...args),
  listUserFiles: (...args: unknown[]) => listUserFiles(...args),
  readOwnedFile: (...args: unknown[]) => readOwnedFile(...args),
  deleteOwnedFile: (...args: unknown[]) => deleteOwnedFile(...args),
}));

const publicFile = {
  id: "f1",
  originalName: "notes.txt",
  mimeType: "text/plain",
  size: 5,
  kind: "document",
  status: "ready",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("file APIs", () => {
  beforeEach(() => {
    authRole = "user";
    uploadUserFile.mockReset();
    listUserFiles.mockReset();
    readOwnedFile.mockReset();
    deleteOwnedFile.mockReset();
    uploadUserFile.mockResolvedValue(publicFile);
    listUserFiles.mockResolvedValue([publicFile]);
    readOwnedFile.mockResolvedValue({ file: publicFile, buffer: Buffer.from("hello") });
  });

  it("requires auth for uploads", async () => {
    authRole = null;
    const { app } = await import("../app.js");
    const response = await request(app).post("/api/files").attach("file", Buffer.from("hello"), "notes.txt");
    expect(response.status).toBe(401);
  });

  it("uploads a file for the current user", async () => {
    const { app } = await import("../app.js");
    const response = await request(app).post("/api/files").attach("file", Buffer.from("hello"), {
      filename: "notes.txt",
      contentType: "text/plain",
    });
    expect(response.status).toBe(201);
    expect(response.body.file.originalName).toBe("notes.txt");
    expect(uploadUserFile).toHaveBeenCalled();
  });
});
