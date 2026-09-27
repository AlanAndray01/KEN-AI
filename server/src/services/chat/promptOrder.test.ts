import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../ai/AIProvider.js";
import { orderForPromptCache } from "./streamTurn.js";

describe("orderForPromptCache", () => {
  const stable: ChatMessage = { role: "system", content: "identity + protocol" };
  const policy: ChatMessage = { role: "system", content: "reply policy for this question" };
  const persona: ChatMessage = { role: "system", content: "custom instructions" };
  const summary: ChatMessage = { role: "system", kind: "summary", content: "summary of older turns" };
  const deepCode: ChatMessage = { role: "system", content: "deep code rules" };

  it("opens with what stays the same between sends and puts per-turn parts after it", () => {
    const result = orderForPromptCache({
      policy: [stable, policy],
      persona: [persona],
      perTurn: [deepCode],
      history: [summary, { role: "user", content: "q1" }, { role: "assistant", content: "a1" }],
      currentUser: { role: "user", content: "q2" },
    });

    expect(result.map((message) => message.content)).toEqual([
      "identity + protocol",
      "custom instructions",
      "summary of older turns",
      "reply policy for this question",
      "deep code rules",
      "q1",
      "a1",
      "q2",
    ]);
  });

  it("does not repeat the current question when history already ends with it", () => {
    const result = orderForPromptCache({
      policy: [stable, policy],
      persona: [],
      perTurn: [],
      history: [{ role: "user", content: "same" }],
      currentUser: { role: "user", content: "same" },
    });

    expect(result.filter((message) => message.content === "same")).toHaveLength(1);
  });
});
