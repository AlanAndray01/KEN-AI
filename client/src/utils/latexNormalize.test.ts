import { describe, expect, it } from "vitest";
import { normalizeLatex } from "./latexNormalize";

describe("normalizeLatex", () => {
  it("converts alternate delimiters and double-escaped commands", () => {
    expect(normalizeLatex("Use \\(E = mc^2\\) and \\\\frac{a}{b}.")).toBe("Use $E = mc^2$ and \\frac{a}{b}.");
  });

  it("leaves fenced code unchanged", () => {
    const source = "```js\nconst x = `\\\\frac`;\n```";
    expect(normalizeLatex(source)).toBe(source);
  });

  it("leaves balanced inline and block math untouched", () => {
    expect(normalizeLatex("Inline $a=1$ stays.")).toBe("Inline $a=1$ stays.");
    expect(normalizeLatex("Block $$a=1$$ stays.")).toBe("Block $$a=1$$ stays.");
  });

  it("escapes a block delimiter that has not been closed yet", () => {
    // Mid-stream fragment: KaTeX would otherwise paint a red error node.
    expect(normalizeLatex("Solving: $$\\frac{a}{")).toBe("Solving: \\$\\$\\frac{a}{");
  });

  it("escapes an unclosed inline delimiter", () => {
    expect(normalizeLatex("The value $x = ")).toBe("The value \\$x = ");
  });

  it("keeps a lone currency amount literal", () => {
    expect(normalizeLatex("It costs $5 today.")).toBe("It costs \\$5 today.");
  });

  it("does not treat an escaped dollar as a delimiter", () => {
    expect(normalizeLatex("Costs \\$5 and \\$10.")).toBe("Costs \\$5 and \\$10.");
  });

  it("neutralises an environment whose end has not streamed in", () => {
    expect(normalizeLatex("\\begin{aligned} v &= u + at")).toBe("\\\\begin{aligned} v &= u + at");
  });

  it("still promotes a complete aligned environment to block math", () => {
    expect(normalizeLatex("\\begin{aligned}v &= u\\end{aligned}")).toContain(
      "$$\n\\begin{aligned}v &= u\\end{aligned}\n$$",
    );
  });

  it("moves the delimiters of a multi-line block onto their own lines", () => {
    // remark-math reads anything trailing an opening `$$` as fence meta, so the
    // block never closes and swallows the rest of the reply into one math node.
    const source = "**Solution**\n$$\\begin{aligned}\na &= 1 \\\\\nb &= 2\n\\end{aligned}$$\n\n**Answer** $a=1$.";
    expect(normalizeLatex(source)).toBe(
      "**Solution**\n\n$$\n\\begin{aligned}\na &= 1 \\\\\nb &= 2\n\\end{aligned}\n$$\n\n**Answer** $a=1$.",
    );
  });

  it("keeps text that follows a block in its own paragraph", () => {
    expect(normalizeLatex("$$\nx = 1\n$$ done.")).toBe("$$\nx = 1\n$$\n\ndone.");
  });

  it("leaves a trailing block without inventing extra blank lines", () => {
    expect(normalizeLatex("Result:\n$$\\begin{aligned}x &= 1\\end{aligned}$$")).toBe(
      "Result:\n\n$$\n\\begin{aligned}x &= 1\\end{aligned}\n$$\n",
    );
  });
});
