import type { Model } from "mongoose";
import { logger } from "../../config/logger.js";
import {
  AIProvider,
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
import { storageService } from "../storage/index.js";
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
 * here — `accountDeletionService.test.ts` asserts this list stays in sync with
 * the registered models so a forgotten collection fails CI instead of silently
 * orphaning personal data in production.
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
];

/**
 * Collections that are deliberately NOT purged, so the exclusion is a recorded
 * decision rather than an oversight:
 *
 * - `AIModel` is a global catalogue keyed by `providerId` string with no owner
 *   field. A user's private provider row is removed above, but the shared model
 *   catalogue must survive or every other account loses its model list.
 * - `User` is deleted last, by `deleteAccount` itself, once its data is gone.
 */

/**
 * Permanently deletes a user and everything owned by them: conversations,
 * messages, attachments, uploaded file bytes, memories, custom GPTs, saved
 * provider keys, usage history, notifications, share links, and sessions.
 *
 * This is irreversible and there is no soft-delete tier, so the caller must
 * have re-authenticated. Ordering is deliberate:
 *   1. verify identity, 2. refuse if it would orphan the last admin,
 *   3. abort in-flight streams, 4. delete stored objects, 5. purge documents,
 *   6. delete the user row.
 * Storage runs before the document purge because the storage keys live on the
 * `File` documents; deleting those first would strand the bytes forever.
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

  generationRegistry.abortUser(userId);

  const { storageObjectsDeleted, storageObjectsFailed } = await purgeStoredObjects(userId);

  const deletedCounts: Record<string, number> = {};
  for (const collection of OWNED_COLLECTIONS) {
    const result = await collection.model.deleteMany({ [collection.field]: userId });
    deletedCounts[collection.name] = result.deletedCount ?? 0;
  }

  await user.deleteOne();
  deletedCounts.users = 1;

  logger.info(
    { userId, deletedCounts, storageObjectsDeleted, storageObjectsFailed },
    "Account deleted",
  );

  return { deletedCounts, storageObjectsDeleted, storageObjectsFailed };
}

/**
 * Best-effort removal of the user's uploaded bytes. A storage backend that is
 * unconfigured or temporarily unreachable must not strand the user with an
 * undeletable account, so failures are counted and logged rather than thrown —
 * the database purge still proceeds.
 */
async function purgeStoredObjects(
  userId: string,
): Promise<{ storageObjectsDeleted: number; storageObjectsFailed: number }> {
  const files = await StoredFile.find({ userId }).select("storageKey");
  let storageObjectsDeleted = 0;
  let storageObjectsFailed = 0;

  for (const file of files) {
    if (!file.storageKey) continue;
    try {
      await storageService.delete(file.storageKey);
      storageObjectsDeleted += 1;
    } catch (error) {
      storageObjectsFailed += 1;
      logger.warn(
        { err: error, userId, storageKey: file.storageKey },
        "Could not delete stored object during account deletion",
      );
    }
  }

  return { storageObjectsDeleted, storageObjectsFailed };
}

/** Exported for the sync test that guards against a missed collection. */
export const OWNED_COLLECTION_NAMES = OWNED_COLLECTIONS.map((entry) => entry.model.modelName);
