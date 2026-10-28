import mongoose, { type Model } from "mongoose";
import { logger } from "../../config/logger.js";
import {
  AIProvider,
  AdminMembershipGuard,
  AnalysisJob,
  Attachment,
  Conversation,
  CustomGPT,
  CustomInstruction,
  File as StoredFile,
  Memory,
  Message,
  Notification,
  PasswordReset,
  Session,
  SharedConversation,
  UsageRecord,
  User,
  UserProviderCredential,
  VerificationToken,
} from "../../models/index.js";
import { AppError } from "../../utils/AppError.js";
import { generationRegistry } from "../chat/generationRegistry.js";
import { queueStorageDeletions, processStorageDeletion, type ObjectDeletion } from "../storage/storageDeletion.js";
import { verifyPassword } from "./crypto.js";

export interface DeleteAccountInput {
  confirmEmail: string;
  password?: string | undefined;
}

export interface AccountDeletionSummary {
  /** Documents removed per collection, for the audit log. */
  deletedCounts: Record<string, number>;
  storageObjectsDeleted: number;
  storageObjectsFailed: number;
}

/**
 * Every collection that stores rows owned by a single user, keyed by the field
 * that holds the owner id. Adding a new user-scoped collection means adding it
 * here. The account deletion integration suite checks ownership isolation,
 * durable cleanup, and concurrent removal of the last administrators.
 */
const OWNED_COLLECTIONS: ReadonlyArray<{
  name: string;
  // Each model has a distinct document shape; deleteMany is the only call made.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  field: string;
}> = [
  { name: "attachments", model: Attachment, field: "userId" },
  { name: "conversations", model: Conversation, field: "userId" },
  { name: "customInstructions", model: CustomInstruction, field: "userId" },
  { name: "files", model: StoredFile, field: "userId" },
  { name: "memories", model: Memory, field: "userId" },
  { name: "messages", model: Message, field: "userId" },
  { name: "notifications", model: Notification, field: "userId" },
  { name: "passwordResets", model: PasswordReset, field: "userId" },
  { name: "sessions", model: Session, field: "userId" },
  { name: "sharedConversations", model: SharedConversation, field: "userId" },
  { name: "usageRecords", model: UsageRecord, field: "userId" },
  { name: "userProviderCredentials", model: UserProviderCredential, field: "userId" },
  { name: "verificationTokens", model: VerificationToken, field: "userId" },
  { name: "customGpts", model: CustomGPT, field: "creatorId" },
  { name: "aiProviders", model: AIProvider, field: "ownerUserId" },
  { name: "analysisJobs", model: AnalysisJob, field: "userId" },
];

/**
 * Collections that are deliberately NOT purged, so the exclusion is a recorded
 * decision rather than an oversight:
 *
 * - `AIModel` is a global catalogue keyed by `providerId` string with no owner
 *   field. A user's private provider row is removed above, but the shared model
 *   catalogue must survive or every other account loses its model list.
 * - `User` is deleted last, by `deleteAccount` itself, once its data is gone.
 * - `StorageDeletion` retains only pending object cleanup information and must
 *   survive the account purge until the object's deletion is acknowledged.
 * - `AdminMembershipGuard` is global coordination state, without an owner.
 * - `SpendBudget` is a daily admission counter retained only until its TTL,
 *   so an in-flight response can reconcile its reserved cost after deletion.
 */

/**
 * Permanently deletes a user and everything owned by them: conversations,
 * messages, attachments, uploaded file bytes, memories, custom GPTs, saved
 * provider keys, usage history, notifications, share links, and sessions.
 *
 * This is irreversible and there is no soft-delete tier, so the caller must
 * have re-authenticated. Ordering is deliberate:
 *   1. verify identity, 2. refuse if it would orphan the last admin,
 *   3. atomically queue storage cleanup and purge documents in a transaction,
 *   4. abort in-flight streams, 5. attempt durable object cleanup.
 */
export async function deleteAccount(
  userId: string,
  input: DeleteAccountInput,
): Promise<AccountDeletionSummary> {
  const user = await User.findById(userId).select("+passwordHash");
  if (!user) {
    throw new AppError("Unauthorized", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  if (input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw new AppError("The email you typed does not match this account", {
      statusCode: 400,
      code: "CONFIRMATION_MISMATCH",
    });
  }

  // Google-only accounts have no password on file; retyping the email is the
  // only proof available for them, and they already passed that check above.
  if (user.passwordHash) {
    if (!input.password) {
      throw new AppError("Enter your password to delete this account", {
        statusCode: 400,
        code: "PASSWORD_REQUIRED",
      });
    }
    const matches = await verifyPassword(user.passwordHash, input.password);
    if (!matches) {
      throw new AppError("Password is incorrect", {
        statusCode: 401,
        code: "INVALID_CREDENTIALS",
      });
    }
  }

  // Losing the only admin would leave the deployment with no way to manage
  // providers or models, and no UI can create a replacement admin.
  if (user.role === "admin") {
    const admins = await User.countDocuments({ role: "admin" });
    if (admins <= 1) {
      throw new AppError(
        "This is the only admin account. Promote another admin before deleting this one.",
        { statusCode: 409, code: "LAST_ADMIN" },
      );
    }
  }

  await AdminMembershipGuard.updateOne({ _id: "admins" }, { $setOnInsert: { version: 0 } }, { upsert: true });
  const session = await mongoose.startSession();
  let deletedCounts: Record<string, number> = {};
  let objects: ObjectDeletion[] = [];
  try {
    await session.withTransaction(async () => {
      // This write serializes membership checks across server processes.
      await AdminMembershipGuard.updateOne({ _id: "admins" }, { $inc: { version: 1 } }, { session });
      const current = await User.findById(userId).session(session);
      if (!current) throw new AppError("Unauthorized", { statusCode: 401, code: "UNAUTHORIZED" });
      if (current.role === "admin" && await User.countDocuments({ role: "admin" }).session(session) <= 1) {
        throw new AppError("This is the only admin account. Promote another admin before deleting this one.",
          { statusCode: 409, code: "LAST_ADMIN" });
      }
      const files = await StoredFile.find({ userId }).select("storageKey storageProvider").session(session);
      objects = files.filter(file => file.storageKey).map(file => ({ provider: file.storageProvider, key: file.storageKey }));
      await queueStorageDeletions(objects, session);
      deletedCounts = {};
      for (const collection of OWNED_COLLECTIONS) {
        const result = await collection.model.deleteMany({ [collection.field]: userId }, { session });
        deletedCounts[collection.name] = result.deletedCount ?? 0;
      }
      await current.deleteOne({ session });
      deletedCounts.users = 1;
    });
  } catch (error) {
    if ((error as { code?: number }).code === 20) throw new AppError(
      "Account deletion requires MongoDB transactions. Configure a replica set or MongoDB Atlas and retry.",
      { statusCode: 503, code: "ACCOUNT_DELETION_UNAVAILABLE" });
    throw error;
  } finally { await session.endSession(); }

  generationRegistry.abortUser(userId);
  let storageObjectsDeleted = 0;
  // Bound response latency; the background worker handles the remaining jobs.
  for (const object of objects.slice(0, 10)) {
    try { if (await processStorageDeletion(object) === true) storageObjectsDeleted += 1; }
    catch (error) { logger.warn({ err: error }, "Account removed; durable file cleanup remains pending"); }
  }
  const storageObjectsFailed = objects.length - storageObjectsDeleted;

  logger.info(
    { userId, deletedCounts, storageObjectsDeleted, storageObjectsFailed },
    "Account deleted",
  );

  return { deletedCounts, storageObjectsDeleted, storageObjectsFailed };
}

/** Exported for the sync test that guards against a missed collection. */
export const OWNED_COLLECTION_NAMES = OWNED_COLLECTIONS.map((entry) => entry.model.modelName);
