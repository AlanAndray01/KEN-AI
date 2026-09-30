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
  it("sends on plain Enter from a laptop or desktop keyboard", () => {
    expect(shouldSubmitOnKey(key())).toBe(true);
  });

  it("keeps Shift+Enter as a newline", () => {
    expect(shouldSubmitOnKey(key({ shiftKey: true }))).toBe(false);
  });

  it("also sends on Ctrl+Enter and on Cmd+Enter", () => {
    expect(shouldSubmitOnKey(key({ ctrlKey: true }))).toBe(true);
    expect(shouldSubmitOnKey(key({ metaKey: true }))).toBe(true);
  });

  it("never sends from a touch keyboard's return key; the Send button does that", () => {
    expect(shouldSubmitOnKey(key(), { coarsePointer: true })).toBe(false);
  });

  it("ignores Enter while an IME is composing", () => {
    expect(shouldSubmitOnKey(key({ isComposing: true }))).toBe(false);
    expect(shouldSubmitOnKey(key({ ctrlKey: true, isComposing: true }))).toBe(false);
  });

  it("does not treat Alt+Enter or other keys as send", () => {
    expect(shouldSubmitOnKey(key({ altKey: true }))).toBe(false);
    expect(shouldSubmitOnKey(key({ key: "a", ctrlKey: true }))).toBe(false);
  });
});
