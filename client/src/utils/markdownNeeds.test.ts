import { describe, expect, it } from "vitest";
import { estimateMarkdownMinHeight, sourceNeedsHighlight, sourceNeedsMath } from "./markdownNeeds";

describe("markdownNeeds", () => {
  it("skips math work for plain prose", () => {
    expect(sourceNeedsMath("Hello there")).toBe(false);
    expect(sourceNeedsMath("Energy is $E = mc^2$.")).toBe(true);
    expect(sourceNeedsMath("Use \\(x\\) then.")).toBe(true);
  });

  it("skips highlight.js unless a fence is present", () => {
    expect(sourceNeedsHighlight("Hello **Ken**")).toBe(false);
    expect(sourceNeedsHighlight("```js\nconst ready = true;\n```")).toBe(true);
  });

  it("reserves height from line count without exceeding a cap", () => {
    expect(estimateMarkdownMinHeight("Hi")).toBe(44);
    expect(estimateMarkdownMinHeight("a\nb\nc")).toBe(66);
    expect(estimateMarkdownMinHeight(`${"line\n".repeat(80)}end`)).toBe(360);
  });
});
