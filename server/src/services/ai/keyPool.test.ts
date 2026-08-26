import { describe, expect, it } from "vitest";
import { nextPoolKey, parseKeyPool, resetKeyPools } from "./keyPool.js";

describe("keyPool", () => {
  it("parses comma-separated keys and rotates them", () => {
    resetKeyPools();
    const keys = parseKeyPool(" a, b ", "c");
    expect(keys).toEqual(["a", "b", "c"]);
    expect(nextPoolKey("groq", keys)).toBe("a");
    expect(nextPoolKey("groq", keys)).toBe("b");
    expect(nextPoolKey("groq", keys)).toBe("c");
    expect(nextPoolKey("groq", keys)).toBe("a");
  });
});
