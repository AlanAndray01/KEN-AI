import mongoose from "mongoose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabase,
  explainSkip,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../../test/mongoHarness.js";
import { Attachment, Conversation, File, Message, User } from "../../models/index.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "earlier document sections (real MongoDB)");

// Imported after the harness connects so model registration has happened.
const { earlierDocumentContext } = await import("./documentContext.js");
const { SECTION_INDEX_VERSION } = await import("../storage/documentIndex.js");
const { loadHistory, withCurrentUser } = await import("./loadHistory.js");

let userId: string;
let conversationId: string;

const POLICY_SECTIONS = [
  "Handbook introduction and purpose.",
  "Refund policy: refunds are issued within 14 days of receiving the returned item.",
  "Shipping: domestic orders arrive in 3 days, international in 10.",
  ...Array.from({ length: 30 }, (_, index) => `Filler section ${index} about office furniture. ${"More text. ".repeat(60)}`),
];

/**
 * A user turn with a document attached. The sections are stored up front, the
 * way documentSectionsFor leaves them after first use, so no file bytes are
 * needed.
 */
async function attachDocument(name: string, sections: string[], at: Date): Promise<string> {
  const file = await File.create({
    userId,
    originalName: name,
    mimeType: "application/pdf",
    size: 1_000,
    storageKey: `test/${new mongoose.Types.ObjectId()}`,
    kind: "document",
    textSections: sections,
    textSectionsVersion: SECTION_INDEX_VERSION,
  });
  const messageId = new mongoose.Types.ObjectId();
  await Message.collection.insertOne({
    _id: messageId,
    conversationId: new mongoose.Types.ObjectId(conversationId),
    userId: new mongoose.Types.ObjectId(userId),
    role: "user",
    content: `Here is ${name}`,
    status: "complete",
    createdAt: at,
    updatedAt: at,
  });
  await Attachment.create({ userId, conversationId, messageId, fileId: file._id });
  return String(messageId);
}

const ask = (question: string, currentMessageId?: string) =>
  earlierDocumentContext({
    userId,
    conversationId,
    question,
    providerId: "groq",
    ...(currentMessageId ? { currentMessageId } : {}),
  });

describe.skipIf(!mongo.ok)("earlier document sections (real MongoDB)", () => {
  afterAll(async () => {
    await stopInMemoryMongo();
  });

  beforeEach(async () => {
    await clearDatabase();
    const user = await User.create({ name: "Ada", email: "ada@example.com", passwordHash: "x", isVerified: true });
    userId = String(user._id);
    const conversation = await Conversation.create({
      userId,
      title: "Docs",
      providerId: "groq",
      modelId: "openai/gpt-oss-20b",
      messageCount: 0,
    });
    conversationId = String(conversation._id);
  });

  it("answers a follow-up from the relevant sections of an earlier attachment", async () => {
    await attachDocument("policy.pdf", POLICY_SECTIONS, new Date(Date.UTC(2026, 0, 1)));

    const context = await ask("How many days until refunds are issued?");

    expect(context).toMatch(/^Earlier attachment: policy\.pdf \(sections /);
    expect(context).toContain("refunds are issued within 14 days");
    // Only the parts that matter, not the whole file.
    expect(context!.length).toBeLessThan(POLICY_SECTIONS.join("\n\n").length / 2);
  });

  it("adds nothing to a turn that is not about the document", async () => {
    await attachDocument("policy.pdf", POLICY_SECTIONS, new Date(Date.UTC(2026, 0, 1)));
    expect(await ask("write me a short poem about the sea")).toBeUndefined();
  });

  it("does not repeat the files attached to the question being answered", async () => {
    const current = await attachDocument("policy.pdf", POLICY_SECTIONS, new Date(Date.UTC(2026, 0, 1)));
    expect(await ask("How many days until refunds are issued?", current)).toBeUndefined();
  });

  it("skips a document that was deleted after it was attached", async () => {
    await attachDocument("policy.pdf", POLICY_SECTIONS, new Date(Date.UTC(2026, 0, 1)));
    await File.deleteMany({});
    expect(await ask("How many days until refunds are issued?")).toBeUndefined();
  });

  it("ignores attachments on turns that an edit or regenerate replaced", async () => {
    const turn = await attachDocument("policy.pdf", POLICY_SECTIONS, new Date(Date.UTC(2026, 0, 1)));
    await Message.updateOne({ _id: turn }, { $set: { "metadata.superseded": true } });
    expect(await ask("How many days until refunds are issued?")).toBeUndefined();
  });

  it("names earlier files in history instead of resending them", async () => {
    await attachDocument("policy.pdf", POLICY_SECTIONS, new Date(Date.UTC(2026, 0, 1)));
    const history = await loadHistory(userId, conversationId);
    expect(history.at(-1)?.content).toBe("Here is policy.pdf\n(Previously attached: policy.pdf)");
    expect(history.at(-1)?.parts).toBeUndefined();
  });

  it("swaps the saved copy of the question for the prepared one by id", async () => {
    const turn = await attachDocument("policy.pdf", POLICY_SECTIONS, new Date(Date.UTC(2026, 0, 1)));
    const history = await loadHistory(userId, conversationId);
    const prepared = { role: "user" as const, content: "Here is policy.pdf\n\nAttached file: …", sourceId: turn };

    const turns = withCurrentUser(history, prepared);
    expect(turns).toHaveLength(history.length);
    expect(turns.at(-1)).toBe(prepared);
  });
});
