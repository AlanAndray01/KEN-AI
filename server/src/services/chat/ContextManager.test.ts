import { describe, expect, it } from "vitest";
import { ContextManager, estimateTokens } from "./ContextManager.js";

describe("ContextManager", () => {
  it("keeps the latest messages when the window is exceeded", () => {
    const manager = new ContextManager();
    const messages = [
      { role: "system" as const, content: "Stay brief" },
      { role: "user" as const, content: "a".repeat(400) },
      { role: "assistant" as const, content: "b".repeat(400) },
      { role: "user" as const, content: "latest question" },
    ];

    const result = manager.build({
      messages,
      modelId: "mock",
      providerId: "mock",
      contextWindow: 120,
    });

    expect(result.some((message) => message.role === "system")).toBe(true);
    expect(result.at(-1)?.content).toBe("latest question");
    expect(result.some((message) => message.content.startsWith("a"))).toBe(false);
    const tokens = result.reduce((sum, message) => sum + estimateTokens(message.content), 0);
    expect(tokens).toBeLessThan(120);
  });

  it("keeps at most the last 6 non-system messages even when the model window is huge", () => {
    const manager = new ContextManager();
    const messages = [
      { role: "system" as const, content: "Stay brief" },
      ...Array.from({ length: 20 }, (_, index) => ({
        role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `turn-${index}`,
      })),
    ];

    const result = manager.build({
      messages,
      modelId: "gemini-flash-latest",
      providerId: "gemini",
      contextWindow: 1_000_000,
    });

    const history = result.filter((message) => message.role !== "system");
    expect(history.length).toBeLessThanOrEqual(6);
    expect(history[0]?.content).toBe("turn-14");
    expect(history.at(-1)?.role).toBe("user");
    expect(history.at(-1)?.content).toBe("turn-18");
  });

  it("strips a trailing assistant turn so Gemini is not sent a model-ending history", () => {
    const manager = new ContextManager();
    const result = manager.build({
      messages: [
        { role: "system", content: "Stay brief" },
        { role: "user", content: "hello" },
        { role: "assistant", content: "Hi there" },
      ],
      modelId: "gemini-3.5-flash-lite",
      providerId: "gemini",
      contextWindow: 1_000_000,
    });
    expect(result.at(-1)?.role).toBe("user");
    expect(result.some((message) => message.role === "assistant")).toBe(false);
  });

  it("keeps estimated input tokens at or below the 12k budget", () => {
    const manager = new ContextManager();
    const messages = [
      { role: "system" as const, content: "sys" },
      ...Array.from({ length: 6 }, (_, index) => ({
        role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: "x".repeat(20_000),
      })),
    ];

    const result = manager.build({
      messages,
      modelId: "gemini-flash-latest",
      providerId: "gemini",
      contextWindow: 1_000_000,
    });
    const tokens = result.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
    expect(tokens).toBeLessThanOrEqual(12_000);
    expect(result.filter((message) => message.role !== "system").length).toBeLessThanOrEqual(6);
  });
});
