import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env, isProduction } from "../../config/env.js";
import { localDevSecret } from "../../config/devSecrets.js";
import { AppError } from "../../utils/AppError.js";

/** Payload format: `v1:{iv}:{authTag}:{ciphertext}` (AES-256-GCM, 12-byte IV). */
const PREFIX = "v1";

function encryptionSecret(): string {
  if (env.ENCRYPTION_KEY) {
    return env.ENCRYPTION_KEY;
  }
  if (isProduction) {
    throw new AppError("ENCRYPTION_KEY is required to store provider credentials", {
      statusCode: 500,
      code: "ENCRYPTION_NOT_CONFIGURED",
      expose: false,
    });
  }
  // Dev only. JWT_SECRET is preferred here purely so credentials encrypted by
  // earlier builds stay readable; a generated local secret is used otherwise.
  return env.JWT_SECRET ?? localDevSecret("encryption");
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
