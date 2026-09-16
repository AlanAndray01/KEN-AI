import { useEffect, useRef } from "react";
import { Keyboard, X } from "lucide-react";
import { submitModifierLabel } from "@/utils/keyboard";

const ROWS = [
  { keys: ["Ctrl", "Shift", "O"], action: "New chat" },
  { keys: ["Ctrl", "K"], action: "Search" },
  { keys: ["Ctrl", ","], action: "Settings" },
  { keys: ["Ctrl", "Shift", "L"], action: "Focus message input" },
  { keys: ["Ctrl", "/"], action: "Keyboard shortcuts" },
  { keys: ["?"], action: "Keyboard shortcuts" },
  { keys: ["Esc"], action: "Close dialog or stop generation" },
] as const;

const FOCUSABLE =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function ShortcutsModal({
  open,
  onClose,
  sendOnEnter,
}: {
  open: boolean;
  onClose: () => void;
  sendOnEnter: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => !el.hasAttribute("disabled"),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const sendKeys = sendOnEnter ? ["Enter"] : [submitModifierLabel(), "Enter"];
  const newlineKeys = sendOnEnter ? ["Shift", "Enter"] : ["Enter"];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-24">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close shortcuts"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        tabIndex={-1}
        className="shortcuts-dialog relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl outline-none"
      >
        <div className="mb-4 flex items-center gap-2">
          <Keyboard className="size-5 text-fg-muted" />
          <h2 id="shortcuts-title" className="flex-1 text-lg font-semibold">
            Keyboard shortcuts
          </h2>
          <button
            ref={closeRef}
            type="button"
            className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          {[
            { keys: sendKeys, action: "Send message" },
            { keys: newlineKeys, action: "New line" },
            ...ROWS,
          ].map((row) => (
            <li key={row.action + row.keys.join("+")} className="flex items-center justify-between gap-4">
              <span>{row.action}</span>
              <span className="flex gap-1">
                {row.keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-border bg-canvas px-1.5 py-0.5 font-mono text-xs"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-fg-muted">On macOS, Ctrl is Command.</p>
      </div>
    </div>
  );
}
