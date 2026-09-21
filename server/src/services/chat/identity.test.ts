import { describe, expect, it } from "vitest";
import { buildKenIdentity, describeSelectedModel, retargetIdentityModel, withKenIdentity } from "./identity.js";

describe("buildKenIdentity", () => {
  it("names the selected model instead of locking Ken to Groq", () => {
    const identity = buildKenIdentity("Gemini 3.8 Flash");
    expect(identity).toContain("You are Ken AI");
    expect(identity).toContain("Gemini 3.8 Flash");
    expect(identity).toContain("I am Ken AI powered by Gemini 3.8 Flash");
    expect(identity).toContain("Do not introduce yourself");
    expect(identity).toContain("if the user's latest message asks");
    expect(identity).not.toContain("provided by Groq");
  });

  it("humanizes a raw model id when no display name is given", () => {
    expect(describeSelectedModel("gemini-3.8-flash")).toBe("Gemini 3.8 Flash");
    expect(describeSelectedModel("qwen/qwen3.6-27b", "Qwen 3.6 27B")).toBe("Qwen 3.6 27B");
  });

  it("tells the model to ignore a different model name in the transcript", () => {
    // A thread that fell back to Cloudflare mid-conversation leaves replies
    // saying "I am Ken AI powered by Llama 4 Scout" in the history. The next
    // turn copied that over its own system prompt, which is how a Gemini turn
    // came to insist it was Llama and that the UI was wrong.
    const identity = buildKenIdentity("Gemini 3.8 Flash");
    expect(identity).toContain("not authoritative for this one");
    expect(identity).toContain("never tell the user that the interface");
  });

  it("does not inject a second identity block", () => {
    const first = withKenIdentity([{ role: "user", content: "Who are you?" }], "Gemini 3.8 Flash");
    expect(first[0]?.content).toContain("Gemini 3.8 Flash");
    expect(withKenIdentity(first, "Qwen 3.6 27B")).toHaveLength(2);
  });

  it("retargets an identity written for an earlier hop", () => {
    // The prompt is built once for the first hop; the fallback chain can then
    // hand the request to another model entirely.
    const first = withKenIdentity([{ role: "user", content: "Who are you?" }], "Gemini 3.8 Flash");
    const moved = withKenIdentity(first, "Llama 4 Scout (Cloudflare)");
    expect(moved[0]?.content).toContain("I am Ken AI powered by Llama 4 Scout (Cloudflare)");
    expect(moved[0]?.content).not.toContain("Gemini 3.8 Flash");
  });

  it("retargets the identity inside a combined system prefix", () => {
    // responsePolicy joins identity + language rule + protocol into one system
    // message, so the rewrite has to work in place rather than on its own.
    const combined = `${buildKenIdentity("Gemini 3.8 Flash")}\n\nAlways reply in the user's language.`;
    const retargeted = retargetIdentityModel(combined, "Qwen 3.8 27B");
    expect(retargeted).toContain("This turn is running on Qwen 3.8 27B.");
    expect(retargeted).toContain("Always reply in the user's language.");
    expect(retargeted).not.toContain("Gemini 3.8 Flash");
  });
});
