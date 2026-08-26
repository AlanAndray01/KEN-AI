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
      "$$\\begin{aligned}v &= u\\end{aligned}$$",
    );
  });
});
