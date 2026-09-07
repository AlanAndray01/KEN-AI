import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders markdown emphasis", () => {
    render(<MarkdownContent>{"Hello **Ken**"}</MarkdownContent>);
    expect(screen.getByText("Ken").tagName).toBe("STRONG");
  });

  it("renders a highlighted code block with a copy control", async () => {
    render(<MarkdownContent>{"```js\nconst ready = true;\n```"}</MarkdownContent>);
    expect(screen.getByText("js")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector("code.hljs")?.textContent).toContain("const ready");
    });
  });

  it("does not load highlight.js for a reply with no code fences", () => {
    render(<MarkdownContent>{"Hello **Ken** — no fences here."}</MarkdownContent>);
    expect(screen.getByText("Ken").tagName).toBe("STRONG");
    expect(document.querySelector("code.hljs")).toBeNull();
  });

  it("renders headings, quotes, and LaTeX", async () => {
    render(
      <MarkdownContent>
        {"## Setup\n\n> Use HttpOnly cookies.\n\nEnergy is $E = mc^2$."}
      </MarkdownContent>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "Setup" })).toBeInTheDocument();
    expect(screen.getByText("Use HttpOnly cookies.")).toBeInTheDocument();
    expect(document.querySelector("blockquote")).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector(".katex")).toBeTruthy();
    });
  });

  it("normalizes alternate math delimiters", async () => {
    render(<MarkdownContent>{"Energy is \\(E = mc^2\\)."}</MarkdownContent>);
    await waitFor(() => {
      expect(document.querySelector(".katex")).toBeTruthy();
    });
  });

  it("renders markdown after a display closer that was glued to the equation", async () => {
    render(
      <MarkdownContent>
        {"$$\nx = \\frac{4 - 8}{4} = -1$$ **Solution:** $x = 3, -1$"}
      </MarkdownContent>,
    );
    expect(screen.getByText("Solution:")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".katex-error")).toBeNull();
      expect(document.querySelector(".katex-display")).toBeTruthy();
    });
  });

  it("renders a mole-conversion fraction as a display block, not inline", async () => {
    // The empirical-formula answer that rendered with its numerators sliced off.
    render(
      <MarkdownContent>
        {"Convert mass to moles:\n\n$$\nn_C = \\frac{32.0}{12.01} = 2.66\n$$\n\nDivide by the smallest."}
      </MarkdownContent>,
    );
    // .katex-display is the block form; its absence is what forced tall fractions
    // into a line box that clipped them.
    expect(screen.getByText("Convert mass to moles:")).toBeInTheDocument();
    expect(screen.getByText("Divide by the smallest.")).toBeInTheDocument();
    await waitFor(() => {
      expect(document.querySelector(".katex-display")).toBeTruthy();
    });
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

    await waitFor(() => {
      expect(document.querySelector(".math-block")).toBeTruthy();
    });
    const wrapper = document.querySelector(".math-block");
    expect(wrapper?.getAttribute("data-tex")).toContain("\\frac{48.0}{1.008}");

    fireEvent.click(screen.getByRole("button", { name: "Copy LaTeX" }));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining("\\frac{48.0}{1.008}"));
    });
  });

  it("leaves inline math without a copy wrapper", async () => {
    render(<MarkdownContent>{"The ratio is $x = 1$ exactly."}</MarkdownContent>);
    await waitFor(() => {
      expect(document.querySelector(".katex")).toBeTruthy();
    });
    expect(document.querySelector(".math-block")).toBeNull();
  });
});
