import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabase,
  explainSkip,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../../test/mongoHarness.js";
import { explainProviderSkip, hasConfiguredAiProvider } from "../../test/providerHarness.js";
import { Conversation, Message, User } from "../../models/index.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "prepareRegenerate (real MongoDB)");

// Pinned to providerId "groq" below, same as prepareEdit's suite.
const providerConfigured = hasConfiguredAiProvider("GROQ_API_KEY");
explainProviderSkip(providerConfigured, "prepareRegenerate (real MongoDB)", ["GROQ_API_KEY"]);

// Imported after the harness connects so model registration has happened.
const { prepareRegenerate, loadHistory } = await import("./chatService.js");

let userId: string;
let conversationId: string;

/** A four-message thread: two complete question/answer pairs. */
async function seedThread(): Promise<{ firstAnswer: string; secondAnswer: string; secondUser: string }> {
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
  const firstAnswer = await Message.create({
    conversationId, userId, role: "assistant", content: "first answer", status: "complete",
    parentMessageId: firstUser._id,
  });
  const secondUser = await Message.create({
    conversationId, userId, role: "user", content: "second question", status: "complete",
  });
  const secondAnswer = await Message.create({
    conversationId, userId, role: "assistant", content: "second answer", status: "complete",
    parentMessageId: secondUser._id,
  });

  return {
    firstAnswer: String(firstAnswer._id),
    secondAnswer: String(secondAnswer._id),
    secondUser: String(secondUser._id),
  };
}

async function supersededContents(): Promise<string[]> {
  const docs = await Message.find({ conversationId, "metadata.superseded": true }).sort({ createdAt: 1 });
  return docs.map((doc) => doc.content);
}

describe.skipIf(!mongo.ok || !providerConfigured)("prepareRegenerate (real MongoDB)", () => {
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

  it("supersedes only the newest answer when it is the one being redone", async () => {
    const { secondAnswer } = await seedThread();

    await prepareRegenerate({ userId, conversationId, messageId: secondAnswer });

    expect(await supersededContents()).toEqual(["second answer"]);
  });

  it("supersedes an older answer and every turn that followed it", async () => {
    const { firstAnswer } = await seedThread();

    await prepareRegenerate({ userId, conversationId, messageId: firstAnswer });

    expect(await supersededContents()).toEqual([
      "first answer",
      "second question",
      "second answer",
    ]);
  });

  it("keeps the question the redone answer belongs to", async () => {
    const { firstAnswer } = await seedThread();

    const prepared = await prepareRegenerate({ userId, conversationId, messageId: firstAnswer });

    expect(prepared.userMessage.content).toBe("first question");
    expect(prepared.assistantMessage.status).toBe("streaming");
    expect(prepared.assistantMessage.content).toBe("");
  });

  it("hides the discarded branch from the history sent to the model", async () => {
    const { firstAnswer } = await seedThread();

    await prepareRegenerate({ userId, conversationId, messageId: firstAnswer });
    const texts = (await loadHistory(userId, conversationId)).map((entry) => String(entry.content));

    expect(texts).toContain("first question");
    expect(texts).not.toContain("first answer");
    expect(texts).not.toContain("second question");
    expect(texts).not.toContain("second answer");
  });

  it("keeps a user turn it is asked to regenerate from, discarding only what followed", async () => {
    const { secondUser } = await seedThread();

    await prepareRegenerate({ userId, conversationId, messageId: secondUser });

    expect(await supersededContents()).toEqual(["second answer"]);
    const reloaded = await Message.findById(secondUser);
    expect((reloaded?.metadata as Record<string, unknown> | null)?.["superseded"]).toBeUndefined();
  });

  it("rejects a malformed message id instead of throwing a cast error", async () => {
    await seedThread();

    await expect(
      prepareRegenerate({ userId, conversationId, messageId: "not-an-object-id" }),
    ).rejects.toMatchObject({ code: "MESSAGE_NOT_FOUND" });
  });
});
