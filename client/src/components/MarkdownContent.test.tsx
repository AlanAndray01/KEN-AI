import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders markdown emphasis", () => {
    render(<MarkdownContent>{"Hello **Ken**"}</MarkdownContent>);
    expect(screen.getByText("Ken").tagName).toBe("STRONG");
  });

  it("renders a highlighted code block with a copy control", () => {
    render(<MarkdownContent>{"```js\nconst ready = true;\n```"}</MarkdownContent>);
    expect(screen.getByText("js")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    expect(document.querySelector("code.hljs")?.textContent).toContain("const ready");
  });

  it("renders headings, quotes, and LaTeX", () => {
    render(
      <MarkdownContent>
        {"## Setup\n\n> Use HttpOnly cookies.\n\nEnergy is $E = mc^2$."}
      </MarkdownContent>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Setup" })).toBeInTheDocument();
    expect(screen.getByText("Use HttpOnly cookies.")).toBeInTheDocument();
    expect(document.querySelector("blockquote")).toBeTruthy();
    expect(document.querySelector(".katex")).toBeTruthy();
  });

  it("normalizes alternate math delimiters", () => {
    render(<MarkdownContent>{"Energy is \\(E = mc^2\\)."}</MarkdownContent>);
    expect(document.querySelector(".katex")).toBeTruthy();
  });

  it("renders a mole-conversion fraction as a display block, not inline", () => {
    // The empirical-formula answer that rendered with its numerators sliced off.
    render(
      <MarkdownContent>
        {"Convert mass to moles:\n\n$$\nn_C = \\frac{32.0}{12.01} = 2.66\n$$\n\nDivide by the smallest."}
      </MarkdownContent>,
    );
    // .katex-display is the block form; its absence is what forced tall fractions
    // into a line box that clipped them.
    expect(document.querySelector(".katex-display")).toBeTruthy();
    expect(screen.getByText("Convert mass to moles:")).toBeInTheDocument();
    expect(screen.getByText("Divide by the smallest.")).toBeInTheDocument();
  });

  it("exposes the original LaTeX of a display block for copying", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    // navigator.clipboard is a read-only accessor in jsdom, so it has to be
    // redefined rather than assigned.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    render(<MarkdownContent>{"$$\nn_H = \\frac{48.0}{1.008}\n$$"}</MarkdownContent>);

    const wrapper = document.querySelector(".math-block");
    expect(wrapper).toBeTruthy();
    expect(wrapper?.getAttribute("data-tex")).toContain("\\frac{48.0}{1.008}");

    fireEvent.click(screen.getByRole("button", { name: "Copy LaTeX" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("\\frac{48.0}{1.008}"));
    });
  });

  it("leaves inline math without a copy wrapper", () => {
    render(<MarkdownContent>{"The ratio is $x = 1$ exactly."}</MarkdownContent>);
    expect(document.querySelector(".katex")).toBeTruthy();
    expect(document.querySelector(".math-block")).toBeNull();
  });
});
