import { describe, expect, it } from "vitest";
import type { PublicMessage } from "@Ken/shared";
import {
  CHAT_MESSAGE_WINDOW,
  appendChunk,
  applyAssistantModel,
  applyFeedback,
  markLastAssistant,
  optimisticTurn,
  startTurn,
  truncateFromMessage,
  upsertMessage,
} from "./chatMessages";

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

function turn(id: string, role: "user" | "assistant", content: string): PublicMessage {
  return { ...message(id), role, content };
}

/** A freshly opened assistant bubble, before the first token lands. */
function streamingTurn(id: string): PublicMessage {
  return { ...message(id), role: "assistant", content: "", status: "streaming" };
}

describe("CHAT_MESSAGE_WINDOW", () => {
  it("keeps the mounted history short enough for the main thread", () => {
    expect(CHAT_MESSAGE_WINDOW).toBeLessThanOrEqual(32);
  });
});

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

describe("applyAssistantModel", () => {
  it("writes the executed model onto the live assistant without clearing text", () => {
    const result = applyAssistantModel(
      [turn("u1", "user", "q"), { ...streamingTurn("a1"), content: "There is" }],
      { model: "gemini-3.5-flash-lite", provider: "gemini" },
    );

    expect(result[1]?.content).toBe("There is");
    expect(result[1]?.model).toBe("gemini-3.5-flash-lite");
    expect(result[1]?.provider).toBe("gemini");
  });
});

describe("markLastAssistant", () => {
  it("marks the last assistant message as failed", () => {
    const result = markLastAssistant([message("a")], "error");
    expect(result[0]?.status).toBe("error");
  });
});

describe("truncateFromMessage", () => {
  const thread = [
    turn("u1", "user", "first question"),
    turn("a1", "assistant", "first answer"),
    turn("u2", "user", "second question"),
    turn("a2", "assistant", "second answer"),
  ];

  it("drops the answer being replaced and everything after it", () => {
    const result = truncateFromMessage(thread, "a1");

    expect(result.map((item) => item.id)).toEqual(["u1"]);
  });

  it("keeps the whole thread up to the newest answer", () => {
    const result = truncateFromMessage(thread, "a2");

    expect(result.map((item) => item.id)).toEqual(["u1", "a1", "u2"]);
  });

  it("leaves the thread untouched when the message is already gone", () => {
    expect(truncateFromMessage(thread, "missing")).toEqual(thread);
  });

  it("does not mutate the original list", () => {
    truncateFromMessage(thread, "a1");

    expect(thread).toHaveLength(4);
  });
});

describe("startTurn", () => {
  it("appends the server's rows to the surviving history", () => {
    const base = [turn("u1", "user", "question")];
    const result = startTurn(base, turn("u1", "user", "question"), streamingTurn("a9"));

    expect(result.map((item) => item.id)).toEqual(["u1", "a9"]);
  });

  it("replaces optimistic bubbles with the persisted rows rather than keeping both", () => {
    const base = [
      turn("u1", "user", "old question"),
      turn("a1", "assistant", "old answer"),
      turn("temp-user-1", "user", "new question"),
      streamingTurn("temp-assistant-1"),
    ];

    const result = startTurn(base, turn("u2", "user", "new question"), streamingTurn("a2"));

    expect(result.map((item) => item.id)).toEqual(["u1", "a1", "u2", "a2"]);
  });

  it("carries text already streamed into an optimistic bubble across to the real one", () => {
    const base = [turn("u1", "user", "q"), { ...streamingTurn("temp-assistant-1"), content: "partial" }];

    const result = startTurn(base, turn("u1", "user", "q"), streamingTurn("a1"));

    expect(result[1]?.content).toBe("partial");
    expect(result[1]?.status).toBe("streaming");
  });

  it("never seeds the new answer with the text of a persisted earlier reply", () => {
    const base = [
      turn("u1", "user", "first question"),
      turn("a1", "assistant", "first answer"),
      turn("u2", "user", "edited question"),
    ];

    const result = startTurn(base, turn("u2", "user", "edited question"), streamingTurn("a2"));

    expect(result[3]?.content).toBe("");
  });

  it("keeps the locally edited wording when the server echoes the same id", () => {
    const base = [turn("u1", "user", "edited question")];

    const result = startTurn(base, turn("u1", "user", "edited question"), streamingTurn("a2"));

    expect(result).toHaveLength(2);
    expect(result[0]?.content).toBe("edited question");
  });
});

describe("edit and resubmit sequence", () => {
  const thread = [
    turn("u1", "user", "first question"),
    turn("a1", "assistant", "first answer"),
    turn("u2", "user", "second question"),
    turn("a2", "assistant", "second answer"),
  ];

  /**
   * The client half of one edit round trip, in the order ChatPage runs it.
   * Nothing is trimmed: the server appends the reworded question as a new turn,
   * so "start" carries a new user id rather than the one that was edited.
   */
  function resubmit(content: string): PublicMessage[] {
    const started = startTurn(thread, turn("u9", "user", content), streamingTurn("a9"));
    const streamed = appendChunk(started, "fresh answer");
    return upsertMessage(streamed, { ...turn("a9", "assistant", "fresh answer"), status: "complete" });
  }

  it("appends the reworded question and its answer to the end of the thread", () => {
    const result = resubmit("edited question");

    expect(result.map((item) => item.id)).toEqual(["u1", "a1", "u2", "a2", "u9", "a9"]);
    expect(result[4]?.content).toBe("edited question");
    expect(result[5]?.content).toBe("fresh answer");
    expect(result[5]?.status).toBe("complete");
  });

  it("loses none of the earlier exchanges", () => {
    const result = resubmit("reworded");

    expect(result.slice(0, 4).map((item) => item.content)).toEqual([
      "first question",
      "first answer",
      "second question",
      "second answer",
    ]);
  });

  it("produces no duplicate ids", () => {
    const result = resubmit("edited question");

    expect(new Set(result.map((item) => item.id)).size).toBe(result.length);
  });
});

describe("regenerate and resubmit sequence", () => {
  const thread = [
    turn("u1", "user", "first question"),
    turn("a1", "assistant", "first answer"),
    turn("u2", "user", "second question"),
    turn("a2", "assistant", "second answer"),
  ];

  it("replaces an older answer in place instead of appending below the thread", () => {
    const trimmed = truncateFromMessage(thread, "a1");
    const started = startTurn(trimmed, turn("u1", "user", "first question"), streamingTurn("a9"));
    const result = appendChunk(started, "better answer");

    expect(result.map((item) => item.id)).toEqual(["u1", "a9"]);
    expect(result[1]?.content).toBe("better answer");
  });

  it("replaces the newest answer without leaving the old one behind", () => {
    const trimmed = truncateFromMessage(thread, "a2");
    const started = startTurn(trimmed, turn("u2", "user", "second question"), streamingTurn("a9"));

    expect(started.map((item) => item.id)).toEqual(["u1", "a1", "u2", "a9"]);
    expect(started.map((item) => item.content)).not.toContain("second answer");
  });
});
