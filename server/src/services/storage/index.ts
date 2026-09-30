import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
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

/**
 * The account endpoint an S3 client should call.
 *
 * Cloudflare shows the R2 "S3 API" address with the bucket on the end
 * (https://<account>.r2.cloudflarestorage.com/<bucket>). Requests here are
 * path-style and add the bucket themselves, so that pasted form would address
 * /<bucket>/<bucket>/<key> and every upload would fail. The trailing bucket
 * is dropped instead.
 */
export function normalizeStorageEndpoint(endpoint: string, bucket: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/, "");
  const suffix = `/${bucket}`;
  return trimmed.endsWith(suffix) ? trimmed.slice(0, -suffix.length) : trimmed;
}

/** The settings an object-storage provider still needs, by env var name. */
export function missingStorageSettings(settings: {
  STORAGE_PROVIDER: string;
  STORAGE_BUCKET?: string | undefined;
  STORAGE_ACCESS_KEY?: string | undefined;
  STORAGE_SECRET_KEY?: string | undefined;
  STORAGE_ENDPOINT?: string | undefined;
}): string[] {
  if (settings.STORAGE_PROVIDER !== "s3" && settings.STORAGE_PROVIDER !== "r2") return [];
  const required = ["STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"] as const;
  const missing: string[] = required.filter((name) => !settings[name]);
  // R2 has no default host: without the account endpoint requests would go to AWS.
  if (settings.STORAGE_PROVIDER === "r2" && !settings.STORAGE_ENDPOINT) missing.push("STORAGE_ENDPOINT");
  return missing;
}

export function createStorageService(): StorageService {
  if (env.STORAGE_PROVIDER === "local") {
    return new LocalDiskStorage(resolveStorageDirectory());
  }
  const missing = missingStorageSettings(env);
  if (
    (env.STORAGE_PROVIDER === "s3" || env.STORAGE_PROVIDER === "r2") &&
    missing.length === 0 &&
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
      ...(env.STORAGE_ENDPOINT ? { endpoint: normalizeStorageEndpoint(env.STORAGE_ENDPOINT, env.STORAGE_BUCKET) } : {}),
      ...(env.STORAGE_PUBLIC_URL ? { publicUrl: env.STORAGE_PUBLIC_URL } : {}),
    });
  }
  // Said once at boot, by name, rather than as a vague failure on every upload.
  logger.error(
    { storageProvider: env.STORAGE_PROVIDER, missing },
    `File storage is not configured: set ${missing.join(", ") || "the provider settings"}. Uploads will fail until then.`,
  );
  return new UnconfiguredStorage(env.STORAGE_PROVIDER);
}

export const storageService: StorageService = createStorageService();
