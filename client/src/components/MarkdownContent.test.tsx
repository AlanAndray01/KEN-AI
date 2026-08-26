import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
