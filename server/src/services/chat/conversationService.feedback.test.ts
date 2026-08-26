import { Types } from "mongoose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/AppError.js";

const conversationFindOne = vi.fn();
const messageFindOne = vi.fn();

vi.mock("../../models/Conversation.js", () => ({
  Conversation: {
    findOne: (...args: unknown[]) => conversationFindOne(...args),
  },
}));

vi.mock("../../models/Message.js", () => ({
  Message: {
    findOne: (...args: unknown[]) => messageFindOne(...args),
  },
}));

vi.mock("./toPublic.js", () => ({
  toPublicMessage: (doc: Record<string, unknown>) => ({
    id: String(doc["_id"]),
    feedback: doc["feedback"],
  }),
  publicAttachmentsForMessages: vi.fn(async () => new Map()),
}));

const ownerId = new Types.ObjectId().toString();
const conversationId = new Types.ObjectId().toString();
const messageId = new Types.ObjectId().toString();

function assistantDoc() {
  const doc: Record<string, unknown> = { _id: messageId, role: "assistant" };
  doc["save"] = vi.fn(async () => doc);
  return doc;
}

describe("setMessageFeedback", () => {
  beforeEach(() => {
    conversationFindOne.mockReset();
    messageFindOne.mockReset();
    conversationFindOne.mockResolvedValue({ _id: conversationId });
  });

  it("persists the rating on an owned assistant message", async () => {
    const doc = assistantDoc();
    messageFindOne.mockResolvedValue(doc);
    const { setMessageFeedback } = await import("./conversationService.js");

    const result = await setMessageFeedback(ownerId, conversationId, messageId, { rating: "up" });

    expect(doc["feedback"]).toEqual({ rating: "up" });
    expect(doc["save"]).toHaveBeenCalledOnce();
    expect(result.feedback).toEqual({ rating: "up" });
  });

  it("overwrites an existing rating so up can be changed to down", async () => {
    const doc = assistantDoc();
    doc["feedback"] = { rating: "up" };
    messageFindOne.mockResolvedValue(doc);
    const { setMessageFeedback } = await import("./conversationService.js");

    await setMessageFeedback(ownerId, conversationId, messageId, { rating: "down" });

    expect(doc["feedback"]).toEqual({ rating: "down" });
  });

  it("scopes the lookup to the caller, their conversation, and assistant messages", async () => {
    messageFindOne.mockResolvedValue(assistantDoc());
    const { setMessageFeedback } = await import("./conversationService.js");

    await setMessageFeedback(ownerId, conversationId, messageId, { rating: "up" });

    expect(messageFindOne).toHaveBeenCalledWith({
      _id: messageId,
      conversationId,
      userId: ownerId,
      role: "assistant",
    });
  });

  it("rejects a message that belongs to another user", async () => {
    messageFindOne.mockResolvedValue(null);
    const { setMessageFeedback } = await import("./conversationService.js");

    await expect(
      setMessageFeedback(ownerId, conversationId, messageId, { rating: "up" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "MESSAGE_NOT_FOUND" });
  });

  it("rejects a malformed message id without querying", async () => {
    const { setMessageFeedback } = await import("./conversationService.js");

    await expect(
      setMessageFeedback(ownerId, conversationId, "not-an-object-id", { rating: "up" }),
    ).rejects.toMatchObject({ statusCode: 404, code: "MESSAGE_NOT_FOUND" });
    expect(messageFindOne).not.toHaveBeenCalled();
  });

  it("rejects a conversation the caller does not own", async () => {
    conversationFindOne.mockResolvedValue(null);
    const { setMessageFeedback } = await import("./conversationService.js");

    await expect(
      setMessageFeedback(ownerId, conversationId, messageId, { rating: "up" }),
    ).rejects.toBeInstanceOf(AppError);
    expect(messageFindOne).not.toHaveBeenCalled();
  });

  it("stores an optional comment but never a blank one", async () => {
    const doc = assistantDoc();
    messageFindOne.mockResolvedValue(doc);
    const { setMessageFeedback } = await import("./conversationService.js");

    await setMessageFeedback(ownerId, conversationId, messageId, { rating: "down", comment: "Wrong" });
    expect(doc["feedback"]).toEqual({ rating: "down", comment: "Wrong" });

    await setMessageFeedback(ownerId, conversationId, messageId, { rating: "down", comment: "" });
    expect(doc["feedback"]).toEqual({ rating: "down" });
  });
});
