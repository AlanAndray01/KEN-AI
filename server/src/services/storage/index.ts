import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { LocalDiskStorage } from "./LocalDiskStorage.js";
import { S3CompatibleStorage } from "./S3CompatibleStorage.js";
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
  if (
    (env.STORAGE_PROVIDER === "s3" || env.STORAGE_PROVIDER === "r2") &&
    env.STORAGE_BUCKET &&
    env.STORAGE_ACCESS_KEY &&
    env.STORAGE_SECRET_KEY
  ) {
    return new S3CompatibleStorage({
      provider: env.STORAGE_PROVIDER,
      bucket: env.STORAGE_BUCKET,
      accessKey: env.STORAGE_ACCESS_KEY,
      secretKey: env.STORAGE_SECRET_KEY,
      region: env.STORAGE_REGION ?? "auto",
      ...(env.STORAGE_ENDPOINT ? { endpoint: env.STORAGE_ENDPOINT } : {}),
      ...(env.STORAGE_PUBLIC_URL ? { publicUrl: env.STORAGE_PUBLIC_URL } : {}),
    });
  }
  return new UnconfiguredStorage(env.STORAGE_PROVIDER);
}

export const storageService: StorageService = createStorageService();
