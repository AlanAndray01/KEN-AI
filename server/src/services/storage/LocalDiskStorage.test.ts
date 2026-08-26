import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LocalDiskStorage } from "./LocalDiskStorage.js";

describe("LocalDiskStorage", () => {
  let root = "";

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("writes, reads, and deletes objects under the root directory", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "Ken-storage-"));
    const storage = new LocalDiskStorage(root);
    const key = "user-1/note.txt";
    await storage.put({ key, buffer: Buffer.from("hello"), mimeType: "text/plain" });
    expect(await storage.exists(key)).toBe(true);
    expect((await storage.get(key)).toString()).toBe("hello");
    expect(await readFile(path.join(root, key), "utf8")).toBe("hello");
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it("rejects path traversal keys", async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "Ken-storage-"));
    const storage = new LocalDiskStorage(root);
    await expect(
      storage.put({ key: "../escape.txt", buffer: Buffer.from("nope"), mimeType: "text/plain" }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
