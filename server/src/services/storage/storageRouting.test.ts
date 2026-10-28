import { afterEach, expect, it, vi } from "vitest";
import { File as StoredFile } from "../../models/File.js";
import type { Request, Response } from "express";
import { getFileHandler } from "../../controllers/fileController.js";

const backends = vi.hoisted(() => ({
  currentGet: vi.fn(), oldGet: vi.fn(async () => Buffer.from("old object")),
  oldDelete: vi.fn(), resolve: vi.fn(),
}));
vi.mock("./index.js", () => ({ storageService: { provider: "local", get: backends.currentGet },
  storageForProvider: backends.resolve,
}));
const { readOwnedFile, deleteOwnedFile } = await import("./fileService.js");
afterEach(() => vi.restoreAllMocks());

it("reads using the file's recorded backend rather than the current upload backend", async () => {
  const row = { storageProvider: "r2", storageKey: "old/key", mimeType: "text/plain", originalName: "old.txt", size: 10 };
  vi.spyOn(StoredFile, "findOne").mockResolvedValue(row as never);
  backends.resolve.mockReturnValue({ get: backends.oldGet });
  expect((await readOwnedFile("user", "000000000000000000000001")).buffer.toString()).toBe("old object");
  expect(backends.resolve).toHaveBeenCalledWith("r2");
  expect(backends.currentGet).not.toHaveBeenCalled();
});

it("preserves a file row when the recorded backend cannot delete its bytes", async () => {
  const removeRow = vi.fn();
  vi.spyOn(StoredFile, "findOne").mockResolvedValue({ storageProvider: "s3", storageKey: "old/key", deleteOne: removeRow } as never);
  backends.resolve.mockImplementation(() => { throw new Error("Old backend unavailable"); });
  await expect(deleteOwnedFile("user", "000000000000000000000001")).rejects.toThrow(/unavailable/);
  expect(removeRow).not.toHaveBeenCalled();
});

it("returns owned metadata without downloading the object", async () => {
  backends.resolve.mockClear();
  vi.spyOn(StoredFile, "findOne").mockResolvedValue({ id: "000000000000000000000001",
    storageProvider: "r2", storageKey: "old/key", originalName: "old.txt", mimeType: "text/plain", size: 10 } as never);
  const json = vi.fn();
  const response = { status: vi.fn().mockReturnThis(), json };
  await getFileHandler({ auth: { userId: "owner" }, params: { id: "000000000000000000000001" } } as unknown as Request,
    response as unknown as Response);
  expect(json).toHaveBeenCalledWith({ file: expect.objectContaining({ originalName: "old.txt" }) });
  expect(backends.resolve).not.toHaveBeenCalled();
});
