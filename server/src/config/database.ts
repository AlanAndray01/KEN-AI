import dns from "node:dns";
import mongoose from "mongoose";
import type { DatabaseHealthStatus } from "@Ken/shared";
import { env } from "./env.js";
import { logger } from "./logger.js";
import { toSafeError } from "../utils/redact.js";
import { registerModels } from "../models/index.js";

dns.setDefaultResultOrder("ipv4first");

const READY_STATE_CONNECTED = 1;

export function isMongoConfigured(): boolean {
  return Boolean(env.MONGODB_URI);
}

export function getDatabaseHealthStatus(): DatabaseHealthStatus {
  if (!isMongoConfigured()) {
    return "not_configured";
  }

  return mongoose.connection.readyState === READY_STATE_CONNECTED ? "connected" : "disconnected";
}

export async function connectDatabase(uri = env.MONGODB_URI): Promise<void> {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured");
  }

  if (mongoose.connection.readyState === READY_STATE_CONNECTED) {
    return;
  }

  mongoose.set("strictQuery", true);

  const maxAttempts = 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        autoIndex: false,
        serverSelectionTimeoutMS: 15_000,
        family: 4,
      });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) break;
      logger.warn(
        { attempt, remaining: maxAttempts - attempt, err: toSafeError(error) },
        "MongoDB connect failed; retrying",
      );
      await new Promise((resolve) => setTimeout(resolve, 2_000 * attempt));
    }
  }
  if (lastError) {
    throw toSafeError(lastError);
  }

  registerModels();
  await ensureIndexes();
  logger.info({ database: "connected" }, "MongoDB connection established");
}

async function ensureIndexes(): Promise<void> {
  const names = mongoose.modelNames();
  await Promise.all(names.map(async (name) => mongoose.model(name).createIndexes()));
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  logger.info({ database: "disconnected" }, "MongoDB connection closed");
}

export function getMongooseConnection(): mongoose.Connection {
  return mongoose.connection;
}
