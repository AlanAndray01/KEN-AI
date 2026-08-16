import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ShortcutsModal } from "./ShortcutsModal";

describe("ShortcutsModal", () => {
  it("lists send and navigation shortcuts", () => {
    render(<ShortcutsModal open onClose={() => undefined} sendOnEnter />);
    expect(screen.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("Send message")).toBeInTheDocument();
    expect(screen.getByText("New chat")).toBeInTheDocument();
    expect(screen.getByText("Search")).toBeInTheDocument();
  });

  it("focuses Close and restores focus after Escape", () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open shortcuts
          </button>
          <ShortcutsModal open={open} onClose={() => setOpen(false)} sendOnEnter />
        </>
      );
    }

    render(<Harness />);
    const opener = screen.getByRole("button", { name: "Open shortcuts" });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("calls onClose from the visible Close button", () => {
    const onClose = vi.fn();
    render(<ShortcutsModal open onClose={onClose} sendOnEnter />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
