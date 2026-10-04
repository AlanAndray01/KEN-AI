import mongoose from "mongoose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearDatabase, explainSkip, stopInMemoryMongo, tryStartInMemoryMongo } from "../test/mongoHarness.js";
import { Attachment, Conversation, File as StoredFile, Message, SharedConversation, User } from "../models/index.js";

/**
 * Database-backed regressions for docs/ALL_BUGS_AND_STEP_BY_STEP_FIXES.md.
 * None of these need a provider key: the failure cases fail during
 * preparation, before any model would be called.
 */
const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "audit regressions (real MongoDB)");

const { listMessages, updateConversation, deleteConversation } = await import("./chat/conversationService.js");
const { prepareRegenerate, prepareEdit } = await import("./chat/chatService.js");
const { exportAllConversations } = await import("./export/exportService.js");

let userId: string;

async function thread(): Promise<{ conversationId: string; userTurn: string; answer: string }> {
  const expiresAt = new Date(Date.now() + 3_600_000);
  const conversation = await Conversation.create({
    userId,
    title: "Seeded",
    providerId: "groq",
    modelId: "no-such-model",
    messageCount: 2,
    expiresAt,
  });
  const conversationId = String(conversation._id);
  const question = await Message.create({
    conversationId, userId, role: "user", content: "question", status: "complete", expiresAt,
  });
  const answer = await Message.create({
    conversationId, userId, role: "assistant", content: "answer", status: "complete",
    parentMessageId: question._id, expiresAt,
  });
  return { conversationId, userTurn: String(question._id), answer: String(answer._id) };
}

describe.skipIf(!mongo.ok)("audit regressions (real MongoDB)", () => {
  afterAll(async () => {
    await stopInMemoryMongo();
  });

  beforeEach(async () => {
    await clearDatabase();
    const user = await User.create({ name: "Ada", email: "ada@example.com", passwordHash: "x", isVerified: true });
    userId = String(user._id);
  });

  it("N3: a failed regenerate leaves the original answer visible", async () => {
    const { conversationId, answer } = await thread();

    await expect(prepareRegenerate({ userId, conversationId, messageId: answer })).rejects.toThrow();

    const visible = await Message.find({ conversationId, "metadata.superseded": { $ne: true } });
    expect(visible.map((doc) => doc.content).sort()).toEqual(["answer", "question"]);
  });

  it("N16: a failed edit persists no unmatched user turn", async () => {
    const { conversationId, userTurn } = await thread();

    await expect(prepareEdit({ userId, conversationId, messageId: userTurn, content: "reworded" })).rejects.toThrow();

    expect(await Message.countDocuments({ conversationId })).toBe(2);
    expect((await Conversation.findById(conversationId))?.messageCount).toBe(2);
  });

  it("N2: pinning clears message expiry and unpinning restores it", async () => {
    const { conversationId } = await thread();

    await updateConversation(userId, conversationId, { pinned: true });
    expect(await Message.countDocuments({ conversationId, expiresAt: { $exists: true } })).toBe(0);

    await updateConversation(userId, conversationId, { pinned: false });
    const conversation = await Conversation.findById(conversationId);
    const messages = await Message.find({ conversationId });
    expect(conversation?.expiresAt).toBeDefined();
    for (const message of messages) {
      expect(message.expiresAt?.getTime()).toBe(conversation?.expiresAt?.getTime());
    }
  });

  it("N6: cursor pages include every timestamp-tied message exactly once", async () => {
    const { conversationId } = await thread();
    const at = new Date(Date.UTC(2026, 0, 1));
    await Message.collection.insertMany(
      Array.from({ length: 6 }, (_, index) => ({
        _id: new mongoose.Types.ObjectId(),
        conversationId: new mongoose.Types.ObjectId(conversationId),
        userId: new mongoose.Types.ObjectId(userId),
        role: index % 2 === 0 ? "user" : "assistant",
        content: `tied-${index}`,
        status: "complete",
        createdAt: at,
        updatedAt: at,
      })),
    );
    await Message.deleteMany({ conversationId, content: { $in: ["question", "answer"] } });

    const seen: string[] = [];
    let before: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const page = await listMessages(userId, conversationId, { limit: 1, ...(before ? { before } : {}) });
      seen.push(...page.messages.map((message) => message.content));
      const oldest = page.messages[0];
      if (!page.hasMore || !oldest) break;
      before = oldest.id;
    }
    expect([...seen].sort()).toEqual(["tied-0", "tied-1", "tied-2", "tied-3", "tied-4", "tied-5"]);
  });

  it("N6: rejects a cursor from another conversation", async () => {
    const first = await thread();
    const second = await thread();
    await expect(
      listMessages(userId, first.conversationId, { limit: 1, before: second.answer }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
  });

  it("N7: export all includes archived chats and crosses the old 200 cap", async () => {
    await Conversation.insertMany(
      Array.from({ length: 205 }, (_, index) => ({
        userId,
        title: `chat-${index}`,
        providerId: "groq",
        modelId: "m",
        archived: index === 0,
        messageCount: 0,
      })),
    );

    const exported = await exportAllConversations(userId, "json");
    const parsed = JSON.parse(exported.body) as unknown;
    const text = JSON.stringify(parsed);
    expect(text).toContain("chat-0");
    expect(text).toContain("chat-204");
  });

  it("N15: deleting a chat removes its share and attachment links but keeps Library files", async () => {
    const { conversationId, userTurn } = await thread();
    const file = await StoredFile.create({
      userId, originalName: "a.png", mimeType: "image/png", size: 3,
      storageProvider: "local", storageKey: `${userId}/a`, status: "ready",
    });
    await Attachment.create({ userId, fileId: file._id, conversationId, messageId: userTurn });
    await SharedConversation.create({ conversationId, userId, token: "share-token", isReadOnly: true });

    await deleteConversation(userId, conversationId);

    expect(await Attachment.countDocuments({ conversationId })).toBe(0);
    expect(await SharedConversation.countDocuments({ conversationId })).toBe(0);
    expect(await StoredFile.countDocuments({ _id: file._id })).toBe(1);
  });
});
