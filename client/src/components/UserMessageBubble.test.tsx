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

  describe("copy", () => {
    it("copies the raw message text to the clipboard", async () => {
      stubContentHeight(80);
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

      render(<UserMessageBubble content="copy me please" />);
      fireEvent.click(screen.getByRole("button", { name: /copy message/i }));

      expect(writeText).toHaveBeenCalledWith("copy me please");
      expect(await screen.findByRole("button", { name: /copied/i })).toBeInTheDocument();
    });

    it("stays quiet when the browser denies clipboard access", async () => {
      stubContentHeight(80);
      const writeText = vi.fn().mockRejectedValue(new Error("denied"));
      vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

      render(<UserMessageBubble content="copy me" />);
      fireEvent.click(screen.getByRole("button", { name: /copy message/i }));

      // The confirmed state must not appear for a copy that did not happen.
      await Promise.resolve();
      expect(screen.queryByRole("button", { name: /copied/i })).not.toBeInTheDocument();
    });
  });

  describe("edit", () => {
    it("offers no edit control in read-only views", () => {
      stubContentHeight(80);
      render(<UserMessageBubble content="shared thread" />);

      expect(screen.queryByRole("button", { name: /edit message/i })).not.toBeInTheDocument();
    });

    it("opens an editor seeded with the current text", () => {
      stubContentHeight(80);
      render(<UserMessageBubble content="original question" onEdit={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /edit message/i }));

      expect(screen.getByRole("textbox", { name: /edit your message/i })).toHaveValue(
        "original question",
      );
    });

    it("submits the rewritten text", () => {
      stubContentHeight(80);
      const onEdit = vi.fn();
      render(<UserMessageBubble content="original question" onEdit={onEdit} />);

      fireEvent.click(screen.getByRole("button", { name: /edit message/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /edit your message/i }), {
        target: { value: "the new question" },
      });
      fireEvent.click(screen.getByRole("button", { name: /update/i }));

      expect(onEdit).toHaveBeenCalledWith("the new question");
    });

    it("submits on Enter but not on Shift+Enter", () => {
      stubContentHeight(80);
      const onEdit = vi.fn();
      render(<UserMessageBubble content="first" onEdit={onEdit} />);

      fireEvent.click(screen.getByRole("button", { name: /edit message/i }));
      const editor = screen.getByRole("textbox", { name: /edit your message/i });
      fireEvent.change(editor, { target: { value: "second" } });

      fireEvent.keyDown(editor, { key: "Enter", shiftKey: true });
      expect(onEdit).not.toHaveBeenCalled();

      fireEvent.keyDown(editor, { key: "Enter" });
      expect(onEdit).toHaveBeenCalledWith("second");
    });

    it("refuses to resend an unchanged message", () => {
      stubContentHeight(80);
      render(<UserMessageBubble content="unchanged" onEdit={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /edit message/i }));

      expect(screen.getByRole("button", { name: /update/i })).toBeDisabled();
    });

    it("refuses to resend an emptied message", () => {
      stubContentHeight(80);
      render(<UserMessageBubble content="something" onEdit={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /edit message/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /edit your message/i }), {
        target: { value: "   " },
      });

      expect(screen.getByRole("button", { name: /update/i })).toBeDisabled();
    });

    it("restores the original text on Cancel", () => {
      stubContentHeight(80);
      const onEdit = vi.fn();
      render(<UserMessageBubble content="original question" onEdit={onEdit} />);

      fireEvent.click(screen.getByRole("button", { name: /edit message/i }));
      fireEvent.change(screen.getByRole("textbox", { name: /edit your message/i }), {
        target: { value: "abandoned draft" },
      });
      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onEdit).not.toHaveBeenCalled();
      expect(screen.getByText("original question")).toBeInTheDocument();
    });

    it("closes the editor on Escape", () => {
      stubContentHeight(80);
      render(<UserMessageBubble content="original" onEdit={vi.fn()} />);

      fireEvent.click(screen.getByRole("button", { name: /edit message/i }));
      fireEvent.keyDown(screen.getByRole("textbox", { name: /edit your message/i }), {
        key: "Escape",
      });

      expect(screen.queryByRole("textbox", { name: /edit your message/i })).not.toBeInTheDocument();
    });

    it("blocks editing while a reply is still streaming", () => {
      stubContentHeight(80);
      render(<UserMessageBubble content="question" onEdit={vi.fn()} editDisabled />);

      expect(screen.getByRole("button", { name: /edit message/i })).toBeDisabled();
    });
  });
});
