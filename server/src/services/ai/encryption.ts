import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env, isProduction } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

const PREFIX = "v1";

function encryptionSecret(): string {
  if (env.ENCRYPTION_KEY) {
    return env.ENCRYPTION_KEY;
  }
  if (!isProduction && env.JWT_SECRET) {
    return env.JWT_SECRET;
  }
  if (!isProduction) {
    return "aether-dev-encryption-key-not-for-production";
  }
  throw new AppError("ENCRYPTION_KEY is required to store provider credentials", {
    statusCode: 500,
    code: "ENCRYPTION_NOT_CONFIGURED",
    expose: false,
  });
}

function keyMaterial(): Buffer {
  return createHash("sha256").update(encryptionSecret()).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyMaterial(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [version, ivPart, tagPart, dataPart] = payload.split(":");
  if (version !== PREFIX || !ivPart || !tagPart || !dataPart) {
    throw new AppError("Stored credential could not be decrypted", {
      statusCode: 500,
      code: "DECRYPTION_FAILED",
      expose: false,
    });
  }

  const decipher = createDecipheriv("aes-256-gcm", keyMaterial(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]).toString("utf8");
}

export function maskSecret(value: string): string {
  if (value.length <= 4) {
    return "••••";
  }
  return `••••${value.slice(-4)}`;
}

export function lastFour(value: string): string {
  return value.slice(-4);
}

export function canPersistSecrets(): boolean {
  try {
    encryptionSecret();
    return true;
  } catch {
    return false;
  }
}
