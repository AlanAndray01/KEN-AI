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
});
