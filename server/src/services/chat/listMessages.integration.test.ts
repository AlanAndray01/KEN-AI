import mongoose from "mongoose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabase,
  explainSkip,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../../test/mongoHarness.js";
import { Conversation, Message, User } from "../../models/index.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "listMessages ordering (real MongoDB)");

// Imported after the harness connects so model registration has happened.
const { listMessages } = await import("./conversationService.js");

let userId: string;
let conversationId: string;

/**
 * Writes question/answer pairs the way prepareSend does: both rows of a pair
 * share one timestamp, because they are created in the same tick.
 *
 * Inserted through the driver rather than the model so the explicit createdAt
 * survives - Mongoose's timestamps would otherwise stamp its own.
 */
async function seedTiedPairs(pairs: number): Promise<void> {
  const docs: Record<string, unknown>[] = [];
  for (let index = 0; index < pairs; index += 1) {
    const at = new Date(Date.UTC(2026, 0, 1, 0, 0, index));
    const userMessageId = new mongoose.Types.ObjectId();
    docs.push({
      _id: userMessageId,
      conversationId: new mongoose.Types.ObjectId(conversationId),
      userId: new mongoose.Types.ObjectId(userId),
      role: "user",
      content: `q${index}`,
      status: "complete",
      createdAt: at,
      updatedAt: at,
    });
    docs.push({
      _id: new mongoose.Types.ObjectId(),
      conversationId: new mongoose.Types.ObjectId(conversationId),
      userId: new mongoose.Types.ObjectId(userId),
      role: "assistant",
      content: `a${index}`,
      status: "complete",
      parentMessageId: userMessageId,
      createdAt: at,
      updatedAt: at,
    });
  }
  await Message.collection.insertMany(docs);
}

const contents = async (limit?: number): Promise<string[]> => {
  const list = await listMessages(userId, conversationId, limit ? { limit } : {});
  return list.map((message) => message.content);
};

describe.skipIf(!mongo.ok)("listMessages ordering (real MongoDB)", () => {
  afterAll(async () => {
    await stopInMemoryMongo();
  });

  beforeEach(async () => {
    await clearDatabase();
    const user = await User.create({
      name: "Ada",
      email: "ada@example.com",
      passwordHash: "x",
      isVerified: true,
    });
    userId = String(user._id);
    const conversation = await Conversation.create({
      userId,
      title: "Seeded",
      providerId: "gemini",
      modelId: "gemini-3.5-flash-lite",
      messageCount: 0,
    });
    conversationId = String(conversation._id);
  });

  it("returns each answer directly after its own question", async () => {
    await seedTiedPairs(3);

    // Sorting on createdAt alone leaves tied rows in an unspecified order, so an
    // answer could surface above the question it replies to.
    expect(await contents()).toEqual(["q0", "a0", "q1", "a1", "q2", "a2"]);
  });

  it("never splits a pair at the limit boundary", async () => {
    await seedTiedPairs(3);

    // The newest page has to be a whole exchange. Dropping the answer here is
    // what made a reply look missing when a long thread was reopened.
    expect(await contents(2)).toEqual(["q2", "a2"]);
  });

  it("keeps the newest rows when the limit cuts mid-thread", async () => {
    await seedTiedPairs(3);

    expect(await contents(3)).toEqual(["a1", "q2", "a2"]);
  });

  it("returns every message when the limit is generous", async () => {
    await seedTiedPairs(25);

    const all = await contents(200);
    expect(all).toHaveLength(50);
    expect(all[0]).toBe("q0");
    expect(all.at(-1)).toBe("a24");
  });
});
