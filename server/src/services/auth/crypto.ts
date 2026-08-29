import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";

/**
 * Argon2id parameters, tuned for a small shared vCPU.
 *
 * The library's defaults (64 MiB, t=3, p=4) assume a dedicated core. On the
 * 0.1-CPU instance this runs on, four parallel lanes contend for a tenth of a
 * core and a single hash takes seconds — which is what made sign-up and sign-in
 * feel broken, since every request blocks on it.
 *
 * These are OWASP's recommended Argon2id settings (m=19456 KiB, t=2, p=1), the
 * configuration intended for exactly this trade: less memory, more iterations,
 * a single lane. Security is not being traded away for speed here — it is the
 * published minimum, and p=1 is the right shape when there is no second core to
 * use anyway.
 *
 * Raise `memoryCost` toward 65536 if this ever moves to a dedicated CPU.
 *
 * Existing hashes are unaffected: Argon2 encodes its parameters in the hash
 * string, so `verify` reads each stored hash's own settings. Passwords hashed
 * before this change keep verifying, and no migration is required.
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateUrlToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return String(randomInt(0, max)).padStart(digits, "0");
}

export function hashesMatch(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length === 0 || a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
