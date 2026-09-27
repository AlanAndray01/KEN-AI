import mongoose from "mongoose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDatabase,
  explainSkip,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../../test/mongoHarness.js";
import { Conversation, Message, User } from "../../models/index.js";

const generate = vi.fn();

vi.mock("../ai/AIProviderManager.js", () => ({
  aiProviderManager: { generate: (...args: unknown[]) => generate(...args) },
}));

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "conversation summaries (real MongoDB)");

// Imported after the harness connects so model registration has happened.
const { refreshConversationSummary, activeSummary, SUMMARY_KEEP_RECENT } = await import("./conversationSummary.js");
const { loadHistory } = await import("./loadHistory.js");

let userId: string;
let conversationId: string;
let ids: mongoose.Types.ObjectId[];

/** q0/a0, q1/a1, ... one second apart, inserted through the driver so createdAt sticks. */
async function seedPairs(pairs: number): Promise<void> {
  ids = [];
  const docs: Record<string, unknown>[] = [];
  for (let index = 0; index < pairs; index += 1) {
    for (const [offset, role, content] of [
      [0, "user", `q${index}`],
      [500, "assistant", `a${index}`],
    ] as const) {
      const at = new Date(Date.UTC(2026, 0, 1, 0, 0, index, offset));
      const _id = new mongoose.Types.ObjectId();
      ids.push(_id);
      docs.push({
        _id,
        conversationId: new mongoose.Types.ObjectId(conversationId),
        userId: new mongoose.Types.ObjectId(userId),
        role,
        content,
        status: "complete",
        createdAt: at,
        updatedAt: at,
      });
    }
  }
  await Message.collection.insertMany(docs);
}

const refresh = () =>
  refreshConversationSummary({ userId, conversationId, providerId: "gemini", modelId: "gemini-3.5-flash-lite" });

describe.skipIf(!mongo.ok)("conversation summaries (real MongoDB)", () => {
  afterAll(async () => {
    await stopInMemoryMongo();
  });

  beforeEach(async () => {
    await clearDatabase();
    generate.mockReset();
    generate.mockResolvedValue({ content: "- Goal: the user is learning about q0 to q2." });
    const user = await User.create({ name: "Ada", email: "ada@example.com", passwordHash: "x", isVerified: true });
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

  it("does nothing while the thread still fits in the recent window", async () => {
    await seedPairs(4);
    await refresh();
    expect(generate).not.toHaveBeenCalled();
  });

  it("summarises the turns older than the recent window and marks where it stops", async () => {
    await seedPairs(6);
    await refresh();

    expect(generate).toHaveBeenCalledTimes(1);
    const request = generate.mock.calls[0]?.[0] as { messages: { content: string }[]; skipQuota: boolean };
    expect(request.skipQuota).toBe(true);
    // 12 messages, 6 kept verbatim: q0..a2 are summarised, q3 onward are not.
    expect(request.messages[1]?.content).toContain("User: q0");
    expect(request.messages[1]?.content).toContain("Ken: a2");
    expect(request.messages[1]?.content).not.toContain("q3");

    const stored = await activeSummary(userId, conversationId);
    expect(stored?.text).toContain("learning about");
    expect(String(stored?.throughMessageId)).toBe(String(ids[SUMMARY_KEEP_RECENT - 1]));
  });

  it("sends the summary in place of the turns it covers, without changing the stored messages", async () => {
    await seedPairs(6);
    await refresh();

    const history = await loadHistory(userId, conversationId);
    expect(history[0]).toMatchObject({ role: "system", kind: "summary" });
    expect(history.slice(1).map((message) => message.content)).toEqual(["q3", "a3", "q4", "a4", "q5", "a5"]);
    // What the user scrolls through is untouched.
    expect(await Message.countDocuments({ conversationId })).toBe(12);
  });

  it("folds the previous summary into the next refresh", async () => {
    await seedPairs(6);
    await refresh();
    await Message.collection.deleteMany({});
    await seedPairs(8);
    // Re-point the stored summary at the re-seeded ids so it stays valid.
    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { "contextSummary.throughMessageId": ids[5], "contextSummary.throughCreatedAt": new Date(Date.UTC(2026, 0, 1, 0, 0, 2, 500)) } },
    );
    await refresh();

    const request = generate.mock.calls[1]?.[0] as { messages: { content: string }[] };
    expect(request.messages[1]?.content).toContain("Previous summary:\n- Goal:");
    expect(request.messages[1]?.content).toContain("User: q3");
    expect(request.messages[1]?.content).not.toContain("User: q2");
  });

  it("ignores a summary whose last covered message was replaced by an edit or regenerate", async () => {
    await seedPairs(6);
    await refresh();
    await Message.updateOne({ _id: ids[SUMMARY_KEEP_RECENT - 1] }, { $set: { "metadata.superseded": true } });

    expect(await activeSummary(userId, conversationId)).toBeUndefined();
    const history = await loadHistory(userId, conversationId);
    expect(history.some((message) => message.kind === "summary")).toBe(false);
  });

  it("keeps the old behaviour when the summariser fails", async () => {
    await seedPairs(6);
    generate.mockRejectedValue(new Error("provider down"));

    await expect(refresh()).resolves.toBeUndefined();
    expect(await activeSummary(userId, conversationId)).toBeUndefined();
  });

  it("rejects an empty summary instead of storing it", async () => {
    await seedPairs(6);
    generate.mockResolvedValue({ content: "   " });
    await refresh();
    expect(await activeSummary(userId, conversationId)).toBeUndefined();
  });
});
