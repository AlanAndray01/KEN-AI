import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { LocalDiskStorage } from "./LocalDiskStorage.js";
import type { StorageService } from "./StorageService.js";
import { UnconfiguredStorage } from "./UnconfiguredStorage.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const repoRoot = path.resolve(serverDir, "..");

export function resolveStorageDirectory(directory = env.STORAGE_DIRECTORY): string {
  if (path.isAbsolute(directory)) {
    return directory;
  }
  return path.resolve(repoRoot, directory);
}

export function createStorageService(): StorageService {
  if (env.STORAGE_PROVIDER === "local") {
    return new LocalDiskStorage(resolveStorageDirectory());
  }
  return new UnconfiguredStorage(env.STORAGE_PROVIDER);
}

export const storageService: StorageService = createStorageService();
