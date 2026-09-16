/**
 * One source of truth for when a key press submits a message.
 *
 * Enter inserts a line break. Ctrl+Enter (Windows, Linux) or ⌘+Enter (macOS)
 * sends. Users can opt back into Enter-to-send in Settings, but a touch keyboard's
 * return key never sends: on a phone it is the only way to type a line break.
 */

export interface SubmitKeyEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** True while an IME (Japanese, Chinese, Korean input) is still composing. */
  isComposing: boolean;
}

export interface SubmitKeyOptions {
  /** The user's Settings opt-in for plain Enter to send. */
  sendOnEnter: boolean;
  /** Primary input is touch, where Enter must always stay a newline. */
  coarsePointer?: boolean;
}

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function isCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches;
}

/** The modifier label to show next to "Enter" in hints and the shortcuts dialog. */
export function submitModifierLabel(): string {
  return isApplePlatform() ? "⌘" : "Ctrl";
}

export function shouldSubmitOnKey(event: SubmitKeyEvent, options: SubmitKeyOptions): boolean {
  if (event.key !== "Enter" || event.isComposing) return false;
  // Alt+Enter is claimed by several OS input methods; never treat it as send.
  if (event.altKey) return false;
  // Either modifier works on every platform: a Windows user on a Mac keyboard
  // layout, or the reverse, should not have to learn which one this app wants.
  if (event.ctrlKey || event.metaKey) return true;
  if (event.shiftKey) return false;
  return options.sendOnEnter && options.coarsePointer !== true;
}
