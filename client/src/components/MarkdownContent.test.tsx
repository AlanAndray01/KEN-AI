import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

describe("MarkdownContent", () => {
  it("renders markdown emphasis", () => {
    render(<MarkdownContent>{"Hello **Aether**"}</MarkdownContent>);
    expect(screen.getByText("Aether").tagName).toBe("STRONG");
  });

  it("renders a highlighted code block with a copy control", () => {
    render(<MarkdownContent>{"```js\nconst ready = true;\n```"}</MarkdownContent>);
    expect(screen.getByText("js")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(document.querySelector("code.hljs")?.textContent).toContain("const ready");
  });
});
