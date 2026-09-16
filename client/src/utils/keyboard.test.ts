import { describe, expect, it } from "vitest";
import { shouldSubmitOnKey, type SubmitKeyEvent } from "./keyboard";

function key(overrides: Partial<SubmitKeyEvent> = {}): SubmitKeyEvent {
  return {
    key: "Enter",
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    isComposing: false,
    ...overrides,
  };
}

describe("shouldSubmitOnKey", () => {
  it("treats plain Enter as a newline by default", () => {
    expect(shouldSubmitOnKey(key(), { sendOnEnter: false })).toBe(false);
  });

  it("sends on Ctrl+Enter and on Cmd+Enter", () => {
    expect(shouldSubmitOnKey(key({ ctrlKey: true }), { sendOnEnter: false })).toBe(true);
    expect(shouldSubmitOnKey(key({ metaKey: true }), { sendOnEnter: false })).toBe(true);
  });

  it("keeps Shift+Enter as a newline", () => {
    expect(shouldSubmitOnKey(key({ shiftKey: true }), { sendOnEnter: false })).toBe(false);
    expect(shouldSubmitOnKey(key({ shiftKey: true }), { sendOnEnter: true })).toBe(false);
  });

  it("honours the Enter-to-send opt-in on a physical keyboard", () => {
    expect(shouldSubmitOnKey(key(), { sendOnEnter: true })).toBe(true);
  });

  it("never sends from a touch keyboard's return key, even when opted in", () => {
    expect(shouldSubmitOnKey(key(), { sendOnEnter: true, coarsePointer: true })).toBe(false);
  });

  it("ignores Enter while an IME is composing", () => {
    expect(shouldSubmitOnKey(key({ ctrlKey: true, isComposing: true }), { sendOnEnter: false })).toBe(false);
  });

  it("does not treat Alt+Enter or other keys as send", () => {
    expect(shouldSubmitOnKey(key({ altKey: true, ctrlKey: true }), { sendOnEnter: false })).toBe(false);
    expect(shouldSubmitOnKey(key({ key: "a", ctrlKey: true }), { sendOnEnter: false })).toBe(false);
  });
});
