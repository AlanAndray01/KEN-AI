import { describe, expect, it } from "vitest";
import type { PublicMessage } from "@Ken/shared";
import { appendChunk, applyFeedback, markLastAssistant, optimisticTurn } from "./chatMessages";

function message(id: string, feedback?: PublicMessage["feedback"]): PublicMessage {
  return {
    id,
    conversationId: "c1",
    role: "assistant",
    content: "Hello",
    status: "complete",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(feedback ? { feedback } : {}),
  };
}

describe("applyFeedback", () => {
  it("sets the rating on the targeted message only", () => {
    const result = applyFeedback([message("a"), message("b")], "b", { rating: "up" });

    expect(result[0]?.feedback).toBeUndefined();
    expect(result[1]?.feedback).toEqual({ rating: "up" });
  });

  it("replaces an existing rating", () => {
    const result = applyFeedback([message("a", { rating: "up" })], "a", { rating: "down" });

    expect(result[0]?.feedback).toEqual({ rating: "down" });
  });

  it("clears the rating when rolling back to no feedback", () => {
    const result = applyFeedback([message("a", { rating: "up" })], "a", undefined);

    expect(result[0]).not.toHaveProperty("feedback");
  });

  it("does not mutate the original list", () => {
    const original = [message("a")];
    applyFeedback(original, "a", { rating: "up" });

    expect(original[0]?.feedback).toBeUndefined();
  });

  it("is a no-op for an unknown message id", () => {
    const original = [message("a")];
    const result = applyFeedback(original, "missing", { rating: "up" });

    expect(result[0]?.feedback).toBeUndefined();
  });
});

describe("appendChunk", () => {
  it("appends text to the last assistant message without waiting for stream end", () => {
    const result = appendChunk(
      [
        message("u"),
        { ...message("a"), role: "assistant", content: "Hel", status: "streaming" },
      ],
      "lo",
    );

    expect(result[1]?.content).toBe("Hello");
    expect(result[1]?.status).toBe("streaming");
  });
});

describe("optimisticTurn", () => {
  it("creates a user bubble and an empty streaming assistant", () => {
    const turn = optimisticTurn("Hi", "pending");
    expect(turn.user.role).toBe("user");
    expect(turn.user.content).toBe("Hi");
    expect(turn.assistant.role).toBe("assistant");
    expect(turn.assistant.content).toBe("");
    expect(turn.assistant.status).toBe("streaming");
  });
});

describe("markLastAssistant", () => {
  it("marks the last assistant message as failed", () => {
    const result = markLastAssistant([message("a")], "error");
    expect(result[0]?.status).toBe("error");
  });
});
