import { describe, expect, it } from "vitest";
import {
  Conversation,
  CustomGPT,
  Memory,
  Message,
  User,
} from "./index.js";

function indexKeyList(model: { schema: { indexes: () => Array<[Record<string, unknown>]> } }): Record<string, unknown>[] {
  return model.schema.indexes().map(([keys]) => keys);
}

describe("model indexes", () => {
  it("defines the required User, Conversation, Message, CustomGPT, and Memory indexes", () => {
    expect(indexKeyList(User)).toEqual(expect.arrayContaining([{ email: 1 }]));
    expect(indexKeyList(Conversation)).toEqual(
      expect.arrayContaining([{ userId: 1, updatedAt: -1 }, { updatedAt: -1 }]),
    );
    expect(indexKeyList(Message)).toEqual(
      expect.arrayContaining([{ conversationId: 1, createdAt: 1 }, { createdAt: -1 }]),
    );
    expect(indexKeyList(CustomGPT)).toEqual(expect.arrayContaining([{ creatorId: 1, updatedAt: -1 }]));
    expect(indexKeyList(Memory)).toEqual(expect.arrayContaining([{ userId: 1, createdAt: -1 }]));
  });
});
