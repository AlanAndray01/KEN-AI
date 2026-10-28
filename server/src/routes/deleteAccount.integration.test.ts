import request from "supertest";
import type { Express } from "express";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDatabase,
  explainSkip,
  loadApp,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../test/mongoHarness.js";
import { registerVerified } from "../test/registerVerified.js";
import {
  Conversation,
  CustomGPT,
  CustomInstruction,
  Memory,
  Message,
  Notification,
  Session,
  SharedConversation,
  UsageRecord,
  User,
  UserProviderCredential,
  File as StoredFile,
  StorageDeletion,
} from "../models/index.js";
import { storageService } from "../services/storage/index.js";
import { processStorageDeletion } from "../services/storage/storageDeletion.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "account deletion (real MongoDB)");

let app: Express;

const credentials = { name: "Ada Lovelace", email: "ada@example.com", password: "Correct-horse-battery1!" };
const other = { name: "Grace Hopper", email: "grace@example.com", password: "Another-horse-battery2!" };

/** Writes one row into every user-scoped collection the purge must clear. */
async function seedUserData(userId: string): Promise<string> {
  const conversation = await Conversation.create({
    userId,
    title: "Seeded chat",
    providerId: "groq",
    modelId: "openai/gpt-oss-120b",
  });
  const conversationId = String(conversation._id);
  await Message.create({
    userId,
    conversationId,
    role: "user",
    content: "hello",
  });
  await Memory.create({ userId, content: "Prefers concise answers" });
  await CustomInstruction.create({ userId, about: "Engineer", style: "Terse" });
  await CustomGPT.create({ creatorId: userId, name: "Seeded GPT" });
  await Notification.create({ userId, type: "system", title: "Welcome", body: "Hi" });
  await UsageRecord.create({
    userId,
    providerId: "groq",
    modelId: "openai/gpt-oss-120b",
    inputTokens: 10,
    outputTokens: 20,
  });
  await SharedConversation.create({ userId, conversationId, token: `tok-${userId}` });
  await UserProviderCredential.create({
    userId,
    providerId: "groq",
    encryptedApiKey: "encrypted",
    enabled: true,
  });
  return conversationId;
}

async function countUserData(userId: string): Promise<number> {
  const counts = await Promise.all([
    Conversation.countDocuments({ userId }),
    Message.countDocuments({ userId }),
    Memory.countDocuments({ userId }),
    CustomInstruction.countDocuments({ userId }),
    CustomGPT.countDocuments({ creatorId: userId }),
    Notification.countDocuments({ userId }),
    UsageRecord.countDocuments({ userId }),
    SharedConversation.countDocuments({ userId }),
    UserProviderCredential.countDocuments({ userId }),
    Session.countDocuments({ userId }),
  ]);
  return counts.reduce((total, value) => total + value, 0);
}

describe.skipIf(!mongo.ok)("account deletion (real MongoDB)", () => {
  afterEach(() => vi.restoreAllMocks());
  beforeAll(async () => {
    app = await loadApp();
  });

  afterAll(async () => {
    await stopInMemoryMongo();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app)
      .delete("/api/me")
      .send({ confirmEmail: credentials.email, password: credentials.password });

    expect(response.status).toBe(401);
  });

  it("keeps failed object cleanup durable after deleting the account and retries it later", async () => {
    const { cookies, userId } = await registerVerified(app, credentials);
    await StoredFile.create({ userId, originalName: "private.txt", mimeType: "text/plain", size: 5,
      storageProvider: "local", storageKey: `${userId}/fake-cleanup-key` });
    const remove = vi.spyOn(storageService, "delete").mockRejectedValue(new Error("Storage unavailable"));
    const response = await request(app).delete("/api/me").set("Cookie", cookies)
      .send({ confirmEmail: credentials.email, password: credentials.password });
    expect(response.status).toBe(200);
    expect(response.body.uploadsPendingDeletion).toBe(1);
    expect(await User.findById(userId)).toBeNull();
    expect(await StoredFile.countDocuments({ userId })).toBe(0);
    expect(await StorageDeletion.findOne()).toMatchObject({ provider: "local", attempts: 1 });
    // A fresh processor invocation recovers solely from durable state.
    remove.mockResolvedValue(undefined);
    await StorageDeletion.updateMany({}, { $set: { nextAttemptAt: new Date(0) } });
    expect(await processStorageDeletion()).toBe(true);
    expect(await StorageDeletion.countDocuments()).toBe(0);
    expect(remove).toHaveBeenLastCalledWith(`${userId}/fake-cleanup-key`);
  });

  it("does not purge ownership rows when cleanup cannot be durably queued", async () => {
    const { cookies, userId } = await registerVerified(app, credentials);
    await StoredFile.create({ userId, originalName: "private.txt", mimeType: "text/plain", size: 5,
      storageProvider: "local", storageKey: `${userId}/fake-unqueued-key` });
    vi.spyOn(StorageDeletion, "bulkWrite").mockRejectedValue(new Error("Queue unavailable"));
    const response = await request(app).delete("/api/me").set("Cookie", cookies)
      .send({ confirmEmail: credentials.email, password: credentials.password });
    expect(response.status).toBe(500);
    expect(await User.countDocuments({ _id: userId })).toBe(1);
    expect(await StoredFile.countDocuments({ userId })).toBe(1);
  });

  it("rejects a confirmation email that does not match the account", async () => {
    const { cookies, userId } = await registerVerified(app, credentials);
    await seedUserData(userId);

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", cookies)
      .send({ confirmEmail: "someone-else@example.com", password: credentials.password });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("CONFIRMATION_MISMATCH");
    expect(await User.countDocuments({ _id: userId })).toBe(1);
    expect(await countUserData(userId)).toBeGreaterThan(0);
  });

  it("rejects a wrong password and leaves every document intact", async () => {
    const { cookies, userId } = await registerVerified(app, credentials);
    await seedUserData(userId);
    const before = await countUserData(userId);

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", cookies)
      .send({ confirmEmail: credentials.email, password: "Wrong-password-entirely9!" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(await User.countDocuments({ _id: userId })).toBe(1);
    expect(await countUserData(userId)).toBe(before);
  });

  it("rejects a missing password for a local account", async () => {
    const { cookies, userId } = await registerVerified(app, credentials);

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", cookies)
      .send({ confirmEmail: credentials.email });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("PASSWORD_REQUIRED");
    expect(await User.countDocuments({ _id: userId })).toBe(1);
  });

  it("deletes the user and every document they own", async () => {
    const { cookies, userId } = await registerVerified(app, credentials);
    await seedUserData(userId);
    expect(await countUserData(userId)).toBeGreaterThan(0);

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", cookies)
      .send({ confirmEmail: credentials.email, password: credentials.password });

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(await User.countDocuments({ _id: userId })).toBe(0);
    expect(await countUserData(userId)).toBe(0);
  });

  it("accepts the confirmation email in a different case", async () => {
    const { cookies, userId } = await registerVerified(app, credentials);

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", cookies)
      .send({ confirmEmail: "ADA@Example.COM", password: credentials.password });

    expect(response.status).toBe(200);
    expect(await User.countDocuments({ _id: userId })).toBe(0);
  });

  it("clears the auth cookies so the browser cannot keep using the session", async () => {
    const { cookies } = await registerVerified(app, credentials);

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", cookies)
      .send({ confirmEmail: credentials.email, password: credentials.password });

    expect(response.status).toBe(200);
    const setCookie = response.headers["set-cookie"] as unknown as string[];
    expect(setCookie.join(";")).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("revokes the session, so the deleted user's cookies stop working", async () => {
    const { cookies } = await registerVerified(app, credentials);

    await request(app)
      .delete("/api/me")
      .set("Cookie", cookies)
      .send({ confirmEmail: credentials.email, password: credentials.password });

    const afterDelete = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(afterDelete.status).toBe(401);
  });

  it("never touches another user's data", async () => {
    const ada = await registerVerified(app, credentials);
    const grace = await registerVerified(app, other);
    await seedUserData(ada.userId);
    await seedUserData(grace.userId);
    const graceBefore = await countUserData(grace.userId);

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", ada.cookies)
      .send({ confirmEmail: credentials.email, password: credentials.password });

    expect(response.status).toBe(200);
    expect(await countUserData(ada.userId)).toBe(0);
    expect(await User.countDocuments({ _id: grace.userId })).toBe(1);
    expect(await countUserData(grace.userId)).toBe(graceBefore);
  });

  it("refuses to delete the only admin account", async () => {
    const { cookies, userId } = await registerVerified(app, credentials);
    await User.updateOne({ _id: userId }, { $set: { role: "admin" } });

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", cookies)
      .send({ confirmEmail: credentials.email, password: credentials.password });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("LAST_ADMIN");
    expect(await User.countDocuments({ _id: userId })).toBe(1);
  });

  it("allows an admin to delete themselves when another admin remains", async () => {
    const ada = await registerVerified(app, credentials);
    const grace = await registerVerified(app, other);
    await User.updateMany({ _id: { $in: [ada.userId, grace.userId] } }, { $set: { role: "admin" } });

    const response = await request(app)
      .delete("/api/me")
      .set("Cookie", ada.cookies)
      .send({ confirmEmail: credentials.email, password: credentials.password });

    expect(response.status).toBe(200);
    expect(await User.countDocuments({ _id: ada.userId })).toBe(0);
    expect(await User.countDocuments({ _id: grace.userId })).toBe(1);
  });

  it("preserves one admin when both remaining admins delete concurrently", async () => {
    const ada = await registerVerified(app, credentials);
    const grace = await registerVerified(app, other);
    await User.updateMany({ _id: { $in: [ada.userId, grace.userId] } }, { $set: { role: "admin" } });
    const responses = await Promise.all([
      request(app).delete("/api/me").set("Cookie", ada.cookies).send({ confirmEmail: credentials.email, password: credentials.password }),
      request(app).delete("/api/me").set("Cookie", grace.cookies).send({ confirmEmail: other.email, password: other.password }),
    ]);
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    expect(await User.countDocuments({ role: "admin" })).toBe(1);
  });
});
