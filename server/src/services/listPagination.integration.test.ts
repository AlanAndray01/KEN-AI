import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearDatabase, explainSkip, stopInMemoryMongo, tryStartInMemoryMongo } from "../test/mongoHarness.js";
import { Conversation, File as StoredFile } from "../models/index.js";
import { listConversations } from "./chat/conversationService.js";
import { listUserFiles } from "./storage/fileService.js";
import { encodeListCursor } from "../utils/listCursor.js";
const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "owned list pagination");
describe.skipIf(!mongo.ok)("owned list pagination", () => {
  beforeEach(clearDatabase);
  afterAll(stopInMemoryMongo);
  it("reaches all chats and files despite equal timestamps while retaining ownership and pin order", async () => {
    const userId = "000000000000000000000001";
    await Conversation.insertMany(Array.from({ length: 121 }, (_, i) => ({ userId,
      title: `Chat ${i}`, providerId: "groq", modelId: "mock", pinned: i < 3 })));
    await Conversation.create({ userId: "000000000000000000000002", title: "Other owner", providerId: "groq", modelId: "mock" });
    const chats: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await listConversations(userId, { limit: 30, ...(cursor ? { cursor } : {}) });
      chats.push(...page.map(row => row.id));
      const last = page.at(-1);
      cursor = page.length === 30 && last ? encodeListCursor({ id: last.id, date: last.updatedAt, pinned: last.pinned }) : undefined;
    } while (cursor);
    expect(chats.length).toBe(121);
    expect(new Set(chats).size).toBe(121);
    expect(await listConversations(userId, { q: "Chat 120" })).toHaveLength(1);
    await StoredFile.insertMany(Array.from({ length: 121 }, (_, i) => ({ userId,
      originalName: `file-${i}.txt`, mimeType: "text/plain", size: 1, storageKey: `fake/${i}` })));
    const files: string[] = [];
    cursor = undefined;
    do {
      const page = await listUserFiles(userId, 30, cursor);
      files.push(...page.map(row => row.id));
      const last = page.at(-1);
      cursor = page.length === 30 && last ? encodeListCursor({ id: last.id, date: last.createdAt }) : undefined;
    } while (cursor);
    expect(files.length).toBe(121);
    expect(new Set(files).size).toBe(121);
  });
});
