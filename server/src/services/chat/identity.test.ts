import { describe, expect, it } from "vitest";
import { buildKenIdentity, describeSelectedModel, withKenIdentity } from "./identity.js";

describe("buildKenIdentity", () => {
  it("names the selected model instead of locking Ken to Groq", () => {
    const identity = buildKenIdentity("Gemini 3.8 Flash");
    expect(identity).toContain("You are Ken AI");
    expect(identity).toContain("Gemini 3.8 Flash");
    expect(identity).toContain("I am Ken AI powered by Gemini 3.8 Flash");
    expect(identity).not.toContain("provided by Groq");
  });

  it("humanizes a raw model id when no display name is given", () => {
    expect(describeSelectedModel("gemini-3.8-flash")).toBe("Gemini 3.8 Flash");
    expect(describeSelectedModel("qwen/qwen3.6-27b", "Qwen 3.6 27B")).toBe("Qwen 3.6 27B");
  });

  it("does not inject a second identity block", () => {
    const first = withKenIdentity([{ role: "user", content: "Who are you?" }], "Gemini 3.8 Flash");
    expect(first[0]?.content).toContain("Gemini 3.8 Flash");
    const again = withKenIdentity(first, "Qwen 3.6 27B");
    expect(again).toHaveLength(2);
    expect(again[0]?.content).toContain("Gemini 3.8 Flash");
  });
});
