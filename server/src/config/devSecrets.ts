import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTest } from "./env.js";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const storePath = path.join(serverDir, ".dev-secrets.json");

const cache = new Map<string, string>();

function generate(): string {
  return randomBytes(32).toString("hex");
}

function readStore(): Record<string, string> {
  if (!existsSync(storePath)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(storePath, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/**
 * Random per-machine secrets for local development, so no usable secret is ever
 * committed to source. They are persisted (gitignored) to keep dev sessions
 * valid across restarts; tests get an ephemeral secret and touch no files.
 * Production never reaches here: env validation requires real secrets.
 */
export function localDevSecret(purpose: string): string {
  const cached = cache.get(purpose);
  if (cached) return cached;

  if (isTest) {
    const ephemeral = generate();
    cache.set(purpose, ephemeral);
    return ephemeral;
  }

  const store = readStore();
  let secret = store[purpose];

  if (!secret) {
    secret = generate();
    store[purpose] = secret;
    try {
      writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    } catch {
      // A read-only checkout still works; sessions just reset on restart.
    }
  }

  cache.set(purpose, secret);
  return secret;
}
