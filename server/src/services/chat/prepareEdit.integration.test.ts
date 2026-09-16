import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabase,
  explainSkip,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../../test/mongoHarness.js";
import { explainProviderSkip, hasConfiguredAiProvider } from "../../test/providerHarness.js";
import { Conversation, Message, User } from "../../models/index.js";
import { AppError } from "../../utils/AppError.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "prepareEdit (real MongoDB)");

// The seeded conversation below is pinned to providerId "groq", so only a Groq
// key can satisfy this suite — a Gemini-only .env would still fail it.
const providerConfigured = hasConfiguredAiProvider("GROQ_API_KEY");
explainProviderSkip(providerConfigured, "prepareEdit (real MongoDB)", ["GROQ_API_KEY"]);

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

async function threadContents(): Promise<string[]> {
  const docs = await Message.find({ conversationId }).sort({ createdAt: 1, _id: 1 });
  return docs.map((doc) => doc.content);
}

describe.skipIf(!mongo.ok || !providerConfigured)("prepareEdit (real MongoDB)", () => {
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

  it("appends the reworded question instead of rewriting the original", async () => {
    const { firstUser } = await seedThread();

    const prepared = await prepareEdit({
      userId, conversationId, messageId: firstUser, content: "rewritten question",
    });

    const original = await Message.findById(firstUser);
    expect(original?.content).toBe("first question");
    expect(prepared.userMessage.content).toBe("rewritten question");
    expect(prepared.userMessage.id).not.toBe(firstUser);
  });

  it("keeps every earlier exchange in the thread", async () => {
    const { firstUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten" });

    expect(await threadContents()).toEqual([
      "first question",
      "first answer",
      "second question",
      "second answer",
      "rewritten",
      "", // the assistant turn that is about to stream
    ]);
  });

  it("supersedes nothing", async () => {
    const { firstUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten" });

    expect(await Message.countDocuments({ conversationId, "metadata.superseded": true })).toBe(0);
  });

  it("records where the reworded question came from", async () => {
    const { firstUser } = await seedThread();

    const prepared = await prepareEdit({
      userId, conversationId, messageId: firstUser, content: "rewritten",
    });

    const appended = await Message.findById(prepared.userMessage.id);
    const metadata = appended?.metadata as Record<string, unknown>;
    expect(metadata["edited"]).toBe(true);
    expect(metadata["editedFromMessageId"]).toBe(firstUser);
  });

  it("sends the model the whole thread, ending with the reworded question", async () => {
    const { firstUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten question" });
    const history = await loadHistory(userId, conversationId);
    const texts = history.map((entry) => String(entry.content));

    expect(texts).toContain("first question");
    expect(texts).toContain("second answer");
    expect(texts.at(-1)).toBe("rewritten question");
  });

  it("counts both new messages against the conversation", async () => {
    const { firstUser } = await seedThread();

    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten" });

    const conversation = await Conversation.findById(conversationId);
    expect(conversation?.messageCount).toBe(6);
  });

  it("opens a fresh assistant turn parented to the appended question", async () => {
    const { firstUser } = await seedThread();

    const prepared = await prepareEdit({
      userId, conversationId, messageId: firstUser, content: "rewritten",
    });

    const assistant = await Message.findById(prepared.assistantMessage.id);
    expect(prepared.assistantMessage.status).toBe("streaming");
    expect(prepared.assistantMessage.content).toBe("");
    expect(String(assistant?.parentMessageId)).toBe(prepared.userMessage.id);
  });

  it("allows editing the same turn twice", async () => {
    const { firstUser } = await seedThread();
    await prepareEdit({ userId, conversationId, messageId: firstUser, content: "rewritten" });

    const second = await prepareEdit({
      userId, conversationId, messageId: firstUser, content: "rewritten again",
    });

    expect(second.userMessage.content).toBe("rewritten again");
  });

  it("refuses to edit an assistant message", async () => {
    await seedThread();
    const assistant = await Message.findOne({ conversationId, role: "assistant" });

    await expect(
      prepareEdit({ userId, conversationId, messageId: String(assistant?._id), content: "nope" }),
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
