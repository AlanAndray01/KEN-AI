import { describe, expect, it } from "vitest";
import { GenerationRegistry } from "./generationRegistry.js";

describe("GenerationRegistry", () => {
  it("aborts the active generation for a conversation and preserves the signal", () => {
    const registry = new GenerationRegistry();
    const controller = registry.start("user-1", "convo-1", "gen-1");
    expect(controller.signal.aborted).toBe(false);
    expect(registry.abortConversation("user-1", "convo-1")).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    registry.finish("gen-1", "user-1", "convo-1");
    expect(registry.abort("gen-1")).toBe(false);
  });
});
