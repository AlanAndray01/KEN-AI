import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AssistantRichBody } from "./RichContent";

describe("AssistantRichBody", () => {
  it("renders a quiz widget from tagged output", () => {
    render(
      <AssistantRichBody
        content={`[QUIZ]
Q: Force equals
A) mass
B) mass times acceleration
C) velocity
D) time
Correct: B
Explanation: F = ma
---
[/QUIZ]`}
      />,
    );
    expect(screen.getByRole("heading", { name: /Quiz/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /mass times acceleration/i })).toBeInTheDocument();
  });

  it("collapses and expands mind map branches", () => {
    render(
      <AssistantRichBody
        content={`[MINDMAP:Motion]
Motion
  Speed
    Distance over time
  Acceleration
    Change in velocity
[/MINDMAP]`}
      />,
    );

    const branch = screen.getByRole("button", { name: /1 Speed/ });
    expect(branch).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/2 branches · 2 points/)).toBeInTheDocument();

    fireEvent.click(branch);
    expect(branch).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(screen.getByRole("button", { name: /expand all/i }));
    expect(branch).toHaveAttribute("aria-expanded", "true");
  });

  it("renders quick revision units with toggleable key points", () => {
    render(
      <AssistantRichBody
        content={`[QUICKREVISION]
Unit: Kinematics
- Speed is scalar
- Velocity is vector
---
[/QUICKREVISION]`}
      />,
    );

    const unit = screen.getByRole("button", { name: /1 Kinematics/ });
    expect(unit).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Speed is scalar")).toBeInTheDocument();

    fireEvent.click(unit);
    expect(unit).toHaveAttribute("aria-expanded", "false");
  });
});
