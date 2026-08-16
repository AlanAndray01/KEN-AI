import { mkdir, readFile, unlink, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { constants as fsConstants } from "node:fs";
import { AppError } from "../../utils/AppError.js";
import type { StorageService, PutObjectInput, StoredObject } from "./StorageService.js";

export class LocalDiskStorage implements StorageService {
  readonly provider = "local" as const;

  constructor(private readonly rootDirectory: string) {}

  async put(input: PutObjectInput): Promise<StoredObject> {
    const absolute = this.resolveKey(input.key);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, input.buffer);
    return { key: input.key, size: input.buffer.length, mimeType: input.mimeType };
  }

  async get(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolveKey(key));
    } catch {
      throw new AppError("File not found", { statusCode: 404, code: "FILE_NOT_FOUND" });
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch {
      // Missing objects are treated as already deleted.
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await access(this.resolveKey(key), fsConstants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  private resolveKey(key: string): string {
    const normalized = key.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.includes("..")) {
      throw new AppError("Invalid storage key", { statusCode: 400, code: "VALIDATION_ERROR" });
    }
    const absolute = path.resolve(this.rootDirectory, normalized);
    const root = path.resolve(this.rootDirectory);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      throw new AppError("Invalid storage key", { statusCode: 400, code: "VALIDATION_ERROR" });
    }
    return absolute;
  }
}
