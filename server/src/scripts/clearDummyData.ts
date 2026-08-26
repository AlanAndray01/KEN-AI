import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import { env, isProduction } from "../config/env.js";
import { connectDatabase, disconnectDatabase } from "../config/database.js";
import { logger } from "../config/logger.js";
import {
  Attachment,
  Conversation,
  CustomGPT,
  CustomInstruction,
  File,
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
} from "../models/index.js";

const DUMMY_EMAIL = /@(example\.com|example\.test|test\.local)$/i;

/**
 * Deletes dummy/test user graphs while leaving collections and indexes intact.
 *
 *   CLEAR_DUMMY_DATA=true npm run clear:dummy -w @Ken/server
 *
 * Production also requires CLEAR_DUMMY_DATA_PRODUCTION=true.
 */
async function main(): Promise<void> {
  if (process.env.CLEAR_DUMMY_DATA !== "true") {
    throw new Error("Refusing to run. Set CLEAR_DUMMY_DATA=true to delete dummy records.");
  }
  if (isProduction && process.env.CLEAR_DUMMY_DATA_PRODUCTION !== "true") {
    throw new Error("Refusing to run in production without CLEAR_DUMMY_DATA_PRODUCTION=true.");
  }

  await connectDatabase();

  const adminEmail = env.INITIAL_ADMIN_EMAIL?.toLowerCase();
  const dummyUsers = await User.find({
    email: adminEmail ? { $regex: DUMMY_EMAIL, $ne: adminEmail } : DUMMY_EMAIL,
  }).select("_id email");

  const userIds = dummyUsers.map((user) => user._id);
  if (userIds.length === 0) {
    logger.info("No dummy users matched @example.com / @example.test / @test.local");
    return;
  }

  const conversations = await Conversation.find({ userId: { $in: userIds } }).select("_id");
  const conversationIds = conversations.map((doc) => doc._id);

  const deletions = await Promise.all([
    Message.deleteMany({ $or: [{ userId: { $in: userIds } }, { conversationId: { $in: conversationIds } }] }),
    Attachment.deleteMany({ userId: { $in: userIds } }),
    File.deleteMany({ userId: { $in: userIds } }),
    Conversation.deleteMany({ userId: { $in: userIds } }),
    Session.deleteMany({ userId: { $in: userIds } }),
    PasswordReset.deleteMany({ userId: { $in: userIds } }),
    VerificationToken.deleteMany({ userId: { $in: userIds } }),
    UserProviderCredential.deleteMany({ userId: { $in: userIds } }),
    Memory.deleteMany({ userId: { $in: userIds } }),
    CustomInstruction.deleteMany({ userId: { $in: userIds } }),
    Notification.deleteMany({ userId: { $in: userIds } }),
    UsageRecord.deleteMany({ userId: { $in: userIds } }),
    SharedConversation.deleteMany({ userId: { $in: userIds } }),
    CustomGPT.deleteMany({ creatorId: { $in: userIds } }),
    User.deleteMany({ _id: { $in: userIds } }),
  ]);

  const deleted = deletions.reduce((sum, result) => sum + (result.deletedCount ?? 0), 0);
  logger.info({ users: userIds.length, documents: deleted }, "Cleared dummy data; schemas and indexes unchanged");
}

void main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Dummy data cleanup failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDatabase();
  });
