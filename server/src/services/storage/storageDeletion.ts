import { randomUUID } from "node:crypto";
import { StorageDeletion } from "../../models/StorageDeletion.js";
import { logger } from "../../config/logger.js";
import { storageForProvider } from "./index.js";
import type { StorageProviderId } from "./StorageService.js";
import { AppError } from "../../utils/AppError.js";
import type { ClientSession } from "mongoose";

export interface ObjectDeletion { provider: StorageProviderId; key: string }

export async function queueStorageDeletions(objects: ObjectDeletion[], session?: ClientSession): Promise<void> {
  if (!objects.length) return;
  await StorageDeletion.bulkWrite(objects.map(({ provider, key }) => ({ updateOne: {
    filter: { provider, key }, update: { $setOnInsert: { provider, key, attempts: 0,
      nextAttemptAt: new Date(), leaseUntil: new Date(0) } }, upsert: true,
  } })), session ? { session } : {});
}

/** A lease makes retries safe across processes; success removes only our claim. */
export async function processStorageDeletion(object?: ObjectDeletion): Promise<boolean | null> {
  const now = new Date();
  const leaseToken = randomUUID();
  const job = await StorageDeletion.findOneAndUpdate({
    ...(object ? { provider: object.provider, key: object.key } : {}),
    nextAttemptAt: { $lte: now }, leaseUntil: { $lte: now },
  }, { $set: { leaseUntil: new Date(now.getTime() + 60_000), leaseToken }, $inc: { attempts: 1 } },
  { returnDocument: "after", sort: { nextAttemptAt: 1 } });
  if (!job) return null;
  const claim = { _id: job._id, leaseToken };
  try {
    await storageForProvider(job.provider).delete(job.key);
    await StorageDeletion.deleteOne(claim);
    return true;
  } catch (error) {
    const lastErrorCode = error instanceof AppError ? error.code : "STORAGE_DELETE_FAILED";
    const backoff = Math.min(30 * 60_000, 5000 * 2 ** Math.min(job.attempts, 10));
    await StorageDeletion.updateOne(claim, { $set: { lastErrorCode,
      leaseUntil: new Date(0), nextAttemptAt: new Date(Date.now() + backoff) }, $unset: { leaseToken: 1 } });
    logger.warn({ deletionId: String(job._id), lastErrorCode, attempts: job.attempts }, "Storage deletion pending retry");
    return false;
  }
}

export function startStorageDeletionWorker(): () => void {
  let running = false;
  let stopped = false;
  const run = async (): Promise<void> => {
    if (running || stopped) return;
    running = true;
    try {
      for (let i = 0; i < 20 && !stopped; i += 1) {
        if (await processStorageDeletion() === null) break;
      }
    } catch (error) {
      logger.error({ err: error }, "Storage deletion worker failed; jobs remain durable");
    } finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, 60_000);
  timer.unref();
  void run();
  return () => { stopped = true; clearInterval(timer); };
}
