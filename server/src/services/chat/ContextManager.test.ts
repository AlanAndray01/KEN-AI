import { describe, expect, it } from "vitest";
import { ContextManager, estimateTokens, MAX_HISTORY_MESSAGES } from "./ContextManager.js";

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

  it("keeps a real conversation when the model window is huge and the turns are small", () => {
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

    // Short turns cost almost nothing, so nothing should be thrown away here.
    // Cutting this to three exchanges regardless of room is what made a long
    // thread forget itself.
    const history = result.filter((message) => message.role !== "system");
    expect(history.length).toBe(19);
    expect(history[0]?.content).toBe("turn-0");
    expect(history.at(-1)?.role).toBe("user");
    expect(history.at(-1)?.content).toBe("turn-18");
  });

  it("keeps the kept history contiguous rather than leaving a hole", () => {
    const manager = new ContextManager();
    // One oversized turn in the middle: the budget cannot fit it, and the
    // older turns behind it must not be pulled in around it.
    const messages = [
      { role: "user" as const, content: "oldest" },
      { role: "assistant" as const, content: "y".repeat(40_000) },
      { role: "user" as const, content: "newest question" },
    ];

    const result = manager.build({
      messages,
      modelId: "qwen/qwen3.8-27b",
      providerId: "groq",
      contextWindow: 131_042,
    });

    const history = result.filter((message) => message.role !== "system");
    expect(history.at(-1)?.content).toBe("newest question");
    expect(history.some((message) => message.content === "oldest")).toBe(false);
  });

  it("gives Groq a tighter budget than Gemini, since its limit is per minute", () => {
    const manager = new ContextManager();
    const messages = [
      ...Array.from({ length: 10 }, (_, index) => ({
        role: (index % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: "x".repeat(8_000),
      })),
      { role: "user" as const, content: "newest question" },
    ];

    const cost = (result: { content: string }[]): number =>
      result.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);

    // Groq free tier meters 8000 tokens a minute across input and output, so a
    // prefill anywhere near Gemini's would spend the whole allowance at once.
    const groq = manager.build({
      messages,
      modelId: "qwen/qwen3.8-27b",
      providerId: "groq",
      contextWindow: 131_042,
    });
    const gemini = manager.build({
      messages,
      modelId: "gemini-flash-latest",
      providerId: "gemini",
      contextWindow: 1_000_000,
    });

    expect(cost(groq)).toBeLessThanOrEqual(6_000);
    expect(cost(gemini)).toBeLessThanOrEqual(32_000);
    expect(cost(gemini)).toBeGreaterThan(cost(groq));
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

  it("keeps estimated input tokens at or below the provider budget", () => {
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
    expect(tokens).toBeLessThanOrEqual(32_000);
    expect(result.filter((message) => message.role !== "system").length).toBeLessThanOrEqual(
      MAX_HISTORY_MESSAGES,
    );
  });
});
