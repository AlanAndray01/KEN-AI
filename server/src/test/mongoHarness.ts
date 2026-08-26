import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import type { Express } from "express";
import { registerModels } from "../models/index.js";

let instance: MongoMemoryServer | undefined;
let startFailure: string | undefined;

export interface MongoStartResult {
  ok: boolean;
  reason?: string;
}

/**
 * Boots a real MongoDB in memory so integration tests exercise genuine queries,
 * indexes, and schema validation rather than model mocks.
 *
 * Returns a failure instead of throwing: the binary needs the Microsoft Visual
 * C++ runtime on Windows, and a machine without it should report a clear skip
 * rather than a misleading test failure.
 */
export async function tryStartInMemoryMongo(): Promise<MongoStartResult> {
  if (instance) return { ok: true };
  if (startFailure) return { ok: false, reason: startFailure };

  try {
    instance = await MongoMemoryServer.create();
    mongoose.set("strictQuery", true);
    await mongoose.connect(instance.getUri(), { autoIndex: false });
    registerModels();
    // Mirrors connectDatabase(): unique constraints must exist for the tests
    // to reflect real production behaviour.
    await Promise.all(mongoose.modelNames().map(async (name) => mongoose.model(name).createIndexes()));
    return { ok: true };
  } catch (error) {
    startFailure = error instanceof Error ? error.message : String(error);
    instance = undefined;
    return { ok: false, reason: startFailure };
  }
}

export function explainSkip(result: MongoStartResult, suite: string): void {
  if (result.ok) return;
  console.warn(
    `[integration] Skipping "${suite}": in-memory MongoDB could not start. ` +
      `On Windows this usually means the Microsoft Visual C++ Redistributable is missing. ` +
      `Reason: ${result.reason ?? "unknown"}`,
  );
}

export async function stopInMemoryMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await instance?.stop();
  instance = undefined;
}

export async function clearDatabase(): Promise<void> {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map(async (collection) => collection.deleteMany({})));
}

/** Loads the Express app after the database connection is established. */
export async function loadApp(): Promise<Express> {
  const { app } = await import("../app.js");
  return app;
}

export function cookiesFrom(response: { headers: Record<string, unknown> }): string[] {
  const raw = response.headers["set-cookie"];
  if (Array.isArray(raw)) return raw.map((entry) => String(entry).split(";")[0] ?? "");
  return [];
}

/** Merges newly issued cookies over an existing jar, like a browser would. */
export function mergeCookies(existing: string[], incoming: string[]): string[] {
  const jar = new Map<string, string>();
  for (const cookie of [...existing, ...incoming]) {
    const name = cookie.split("=")[0];
    if (name) jar.set(name, cookie);
  }
  return [...jar.values()];
}
