import { useCallback, useEffect, useRef, useState } from "react";

/** How close to the bottom still counts as "following the conversation". */
const BOTTOM_THRESHOLD_PX = 96;

/**
 * Keeps a scroll container pinned to the newest content while the reader is at
 * the bottom, and gets out of the way the moment they scroll up to re-read
 * something. Streaming appends land every animation frame, so the write path is
 * a direct `scrollTop` assignment rather than `scrollIntoView`: smooth scrolls
 * queued at frame rate fight each other and read as jitter.
 */
export function useStickToBottom<T extends HTMLElement>(): {
  containerRef: React.RefObject<T | null>;
  pinned: boolean;
  stickToBottom: () => void;
  scrollToBottom: (behavior?: ScrollBehavior) => void;
  pin: () => void;
} {
  const containerRef = useRef<T | null>(null);
  // Mirrored in a ref so the scroll listener and the append effect can read the
  // current value without re-subscribing on every render.
  const pinnedRef = useRef(true);
  const [pinned, setPinned] = useState(true);

  const setPinnedState = useCallback((next: boolean) => {
    if (pinnedRef.current === next) return;
    pinnedRef.current = next;
    setPinned(next);
  }, []);

  const frameRef = useRef<number | null>(null);

  const writeScrollTop = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = containerRef.current;
    if (!element) return;
    // Read geometry in the same frame as the write so we do not invalidate
    // layout and then query it again.
    const { scrollHeight } = element;
    if (behavior !== "auto" && typeof element.scrollTo === "function") {
      element.scrollTo({ top: scrollHeight, behavior });
      return;
    }
    element.scrollTop = scrollHeight;
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    writeScrollTop(behavior);
  }, [writeScrollTop]);

  /** Follow new content only while the reader has not scrolled away. */
  const stickToBottom = useCallback(() => {
    if (!pinnedRef.current) return;
    if (frameRef.current != null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      if (!pinnedRef.current) return;
      writeScrollTop();
    });
  }, [writeScrollTop]);

  /** Re-attach to the bottom, e.g. after the reader sends a new message. */
  const pin = useCallback(() => {
    setPinnedState(true);
    scrollToBottom();
  }, [scrollToBottom, setPinnedState]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const onScroll = (): void => {
      const { scrollHeight, scrollTop, clientHeight } = element;
      setPinnedState(scrollHeight - scrollTop - clientHeight <= BOTTOM_THRESHOLD_PX);
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      element.removeEventListener("scroll", onScroll);
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [setPinnedState]);

  return { containerRef, pinned, stickToBottom, scrollToBottom, pin };
}
