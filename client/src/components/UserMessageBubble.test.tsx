import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserMessageBubble } from "./UserMessageBubble";

/**
 * jsdom reports every element as zero-height, so collapsing can only be
 * exercised by stubbing the one measurement the component reads.
 */
function stubContentHeight(px: number): void {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(px);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("UserMessageBubble", () => {
  it("shows a short message with no collapse control", async () => {
    stubContentHeight(80);
    render(<UserMessageBubble content="Assalam o Alaikum" />);

    expect(await screen.findByText("Assalam o Alaikum")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

  it("collapses a long message behind a Show more control", () => {
    stubContentHeight(900);
    render(<UserMessageBubble content={"line\n\n".repeat(60)} />);

    expect(screen.getByRole("button", { name: /show more/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("expands and collapses again on click", () => {
    stubContentHeight(900);
    render(<UserMessageBubble content={"line\n\n".repeat(60)} />);

    fireEvent.click(screen.getByRole("button", { name: /show more/i }));
    const collapse = screen.getByRole("button", { name: /show less/i });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(collapse);
    expect(screen.getByRole("button", { name: /show more/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("does not collapse when the overflow is trivial", () => {
    // Just past the clamp height but under the minimum worthwhile overflow.
    stubContentHeight(240);
    render(<UserMessageBubble content="a medium message" />);

    expect(screen.queryByRole("button", { name: /show more/i })).not.toBeInTheDocument();
  });

  it("renders attachments passed as children", async () => {
    stubContentHeight(80);
    render(
      <UserMessageBubble content="see this">
        <span>attachment-chip</span>
      </UserMessageBubble>,
    );

    expect(await screen.findByText("attachment-chip")).toBeInTheDocument();
  });
});
