import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabase,
  explainSkip,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../../test/mongoHarness.js";
import { Conversation, Message, User } from "../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "prepareEdit (real MongoDB)");

// Imported after the harness connects so model registration has happened.
const { prepareEdit, loadHistory } = await import("./chatService.js");

let userId: string;
let conversationId: string;

/** A four-message thread: two complete question/answer pairs. */
async function seedThread(): Promise<{ firstUser: string; secondUser: string }> {
  const conversation = await Conversation.create({
    userId,
    title: "Seeded",
    providerId: "groq",
    modelId: "openai/gpt-oss-120b",
    messageCount: 4,
  });
  conversationId = String(conversation._id);

  const firstUser = await Message.create({
    conversationId, userId, role: "user", content: "first question", status: "complete",
  });
  await Message.create({
    conversationId, userId, role: "assistant", content: "first answer", status: "complete",
    parentMessageId: firstUser._id,
  });
  const secondUser = await Message.create({
    conversationId, userId, role: "user", content: "second question", status: "complete",
  });
  await Message.create({
    conversationId, userId, role: "assistant", content: "second answer", status: "complete",
    parentMessageId: secondUser._id,
  });

  return { firstUser: String(firstUser._id), secondUser: String(secondUser._id) };
}

async function supersededContents(): Promise<string[]> {
  const docs = await Message.find({ conversationId, "metadata.superseded": true }).sort({ createdAt: 1 });
  return docs.map((doc) => doc.content);
}

describe.skipIf(!mongo.ok)("prepareEdit (real MongoDB)", () => {
  afterAll(async () => {
    await stopInMemoryMongo();
  });

  beforeEach(async () => {
    await clearDatabase();
    const user = await User.create({
      name: "Ada", email: "ada@example.com", passwordHash: "x", isVerified: true,
    });
    userId = String(user._id);
  });

  it("replaces the content of the edited turn", async () => {
    const { firstUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten question" });

    const reloaded = await Message.findById(firstUser);
    expect(reloaded?.content).toBe("rewritten question");
    expect((reloaded?.metadata as Record<string, unknown>)["edited"]).toBe(true);
  });

  it("supersedes every message after the edited turn", async () => {
    const { firstUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten" });

    expect(await supersededContents()).toEqual([
      "first answer",
      "second question",
      "second answer",
    ]);
  });

  it("leaves earlier turns in the thread untouched", async () => {
    const { secondUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: secondUser, content: "reworded" });

    expect(await supersededContents()).toEqual(["second answer"]);
  });

  it("never supersedes the edited message itself", async () => {
    const { firstUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten" });

    const reloaded = await Message.findById(firstUser);
    expect((reloaded?.metadata as Record<string, unknown> | null)?.["superseded"]).toBeUndefined();
  });

  it("hides the discarded branch from the history sent to the model", async () => {
    const { firstUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten question" });
    const history = await loadHistory(userId, conversationId);
    const texts = history.map((entry) => String(entry.content));

    expect(texts).toContain("rewritten question");
    expect(texts).not.toContain("first question");
    expect(texts).not.toContain("second question");
    expect(texts).not.toContain("second answer");
  });

  it("opens a fresh assistant turn parented to the edited message", async () => {
    const { firstUser } = await seedThread();

    const prepared = await prepareEdit({
      userId, conversationId, messageId: firstUser, content: "rewritten",
    });

    expect(prepared.assistantMessage.status).toBe("streaming");
    expect(prepared.assistantMessage.content).toBe("");
    expect(prepared.userMessage.content).toBe("rewritten");
  });

  it("refuses to edit an assistant message", async () => {
    await seedThread();
    const assistant = await Message.findOne({ conversationId, role: "assistant" });

    await expect(
      prepareEdit({ userId, conversationId, messageId: String(assistant?._id), content: "nope" }),
    ).rejects.toMatchObject({ code: "EDIT_UNAVAILABLE" });
  });

  it("refuses to edit a message that was already superseded", async () => {
    const { firstUser, secondUser } = await seedThread();
    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten" });

    await expect(
      prepareEdit({ userId, conversationId, messageId: secondUser, content: "too late" }),
    ).rejects.toMatchObject({ code: "EDIT_UNAVAILABLE" });
  });

  it("refuses to edit another user's message", async () => {
    const { firstUser } = await seedThread();
    const intruder = await User.create({
      name: "Mallory", email: "mallory@example.com", passwordHash: "x", isVerified: true,
    });

    await expect(
      prepareEdit({
        userId: String(intruder._id), conversationId, messageId: firstUser, content: "hijack",
      }),
    ).rejects.toBeInstanceOf(AppError);

    const reloaded = await Message.findById(firstUser);
    expect(reloaded?.content).toBe("first question");
  });

  it("rejects a malformed message id instead of throwing a cast error", async () => {
    await seedThread();

    await expect(
      prepareEdit({ userId, conversationId, messageId: "not-an-object-id", content: "x" }),
    ).rejects.toMatchObject({ code: "MESSAGE_NOT_FOUND" });
  });
});
