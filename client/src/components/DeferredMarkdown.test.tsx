import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DeferredMarkdown } from "./DeferredMarkdown";

describe("DeferredMarkdown", () => {
  it("does not keep eager turns on the plain-text placeholder", () => {
    const { container } = render(<DeferredMarkdown eager>{"Hello **Ken**"}</DeferredMarkdown>);
    expect(container.querySelector(".markdown-placeholder")).toBeNull();
  });

  it("keeps off-screen history as plain text until it is near the viewport", () => {
    render(<DeferredMarkdown eager={false}>{"Older **reply**"}</DeferredMarkdown>);
    expect(screen.getByText("Older **reply**")).toBeInTheDocument();
    expect(document.querySelector(".markdown")).toBeNull();
  });
});
