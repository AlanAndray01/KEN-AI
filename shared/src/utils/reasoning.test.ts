import { describe, expect, it } from "vitest";
import { createReasoningFilter, stripReasoning } from "./reasoning.js";

/** Feeds chunks through the filter and returns the concatenated result. */
function run(chunks: string[]): { visible: string; reasoning: string } {
  const filter = createReasoningFilter();
  let visible = "";
  let reasoning = "";
  for (const chunk of chunks) {
    const out = filter.push(chunk);
    visible += out.visible;
    reasoning += out.reasoning;
  }
  const tail = filter.flush();
  return { visible: visible + tail.visible, reasoning: reasoning + tail.reasoning };
}

describe("createReasoningFilter", () => {
  it("removes a think block that arrives in one chunk", () => {
    const result = run(["<think>plan the answer</think>Assalam o Alaikum!"]);
    expect(result.visible).toBe("Assalam o Alaikum!");
    expect(result.reasoning).toBe("plan the answer");
  });

  it("removes a think block whose tags straddle chunk boundaries", () => {
    // The failure the naive replace() approach cannot handle.
    const result = run(["<th", "ink>weigh", " the options</thi", "nk>Final answer."]);
    expect(result.visible).toBe("Final answer.");
    expect(result.reasoning).toBe("weigh the options");
  });

  it("splits a tag across every possible boundary without leaking", () => {
    const source = "<think>hidden</think>shown";
    for (let cut = 1; cut < source.length; cut += 1) {
      const result = run([source.slice(0, cut), source.slice(cut)]);
      expect(result.visible, `split at ${cut}`).toBe("shown");
      expect(result.reasoning, `split at ${cut}`).toBe("hidden");
    }
  });

  it("streams ordinary text through untouched, chunk by chunk", () => {
    const filter = createReasoningFilter();
    expect(filter.push("Newton ").visible).toBe("Newton ");
    expect(filter.push("ka doosra ").visible).toBe("ka doosra ");
    expect(filter.push("qanoon.").visible).toBe("qanoon.");
    expect(filter.flush().visible).toBe("");
  });

  it("does not hold back text that only looks like a tag start", () => {
    const result = run(["a < b aur c > d"]);
    expect(result.visible).toBe("a < b aur c > d");
    expect(result.reasoning).toBe("");
  });

  it("keeps content that follows a closed block on the same chunk", () => {
    const result = run(["<think>x</think>Line one.\nLine two."]);
    expect(result.visible).toBe("Line one.\nLine two.");
  });

  it("handles several blocks in one stream", () => {
    const result = run(["<think>a</think>One.<think>b</think>Two."]);
    expect(result.visible).toBe("One.Two.");
    expect(result.reasoning).toBe("ab");
  });

  it("supports <thinking> and <reasoning> aliases", () => {
    expect(run(["<thinking>x</thinking>Hi"]).visible).toBe("Hi");
    expect(run(["<reasoning>y</reasoning>Hi"]).visible).toBe("Hi");
  });

  it("reports an unterminated block and does not leak it on flush", () => {
    const filter = createReasoningFilter();
    filter.push("<think>never closed");
    expect(filter.isUnterminated()).toBe(true);
    expect(filter.flush().visible).toBe("");
  });

  it("emits nothing for an empty chunk", () => {
    const filter = createReasoningFilter();
    expect(filter.push("")).toEqual({ visible: "", reasoning: "" });
  });
});

describe("stripReasoning", () => {
  it("removes the block and the blank line it leaves behind", () => {
    const result = stripReasoning("<think>internal</think>\n\nSalam!");
    expect(result.visible).toBe("Salam!");
    expect(result.reasoning).toBe("internal");
  });

  it("leaves a clean reply unchanged", () => {
    expect(stripReasoning("F = ma").visible).toBe("F = ma");
  });

  it("strips the exact leak reported from the UI", () => {
    const leaked = [
      "<think>",
      "The user sent a blank/typo message.",
      "Check constraints:",
      "- Length: ~78 words. Good.",
      "Follows all constraints. Output matches.",
      "</think>",
      "",
      "Assalam o Alaikum! Kya parhna hai aaj?",
    ].join("\n");

    const result = stripReasoning(leaked);
    expect(result.visible).toBe("Assalam o Alaikum! Kya parhna hai aaj?");
    expect(result.visible).not.toContain("<think>");
    expect(result.visible).not.toContain("constraints");
  });
});
