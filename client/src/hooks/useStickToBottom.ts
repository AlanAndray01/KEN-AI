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

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
    const element = containerRef.current;
    if (!element) return;
    // `scrollTo` is absent in jsdom and in a few older engines; the direct
    // assignment below is the equivalent instant jump.
    if (typeof element.scrollTo === "function") {
      element.scrollTo({ top: element.scrollHeight, behavior });
      return;
    }
    element.scrollTop = element.scrollHeight;
  }, []);

  /** Follow new content only while the reader has not scrolled away. */
  const stickToBottom = useCallback(() => {
    if (!pinnedRef.current) return;
    const element = containerRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, []);

  /** Re-attach to the bottom, e.g. after the reader sends a new message. */
  const pin = useCallback(() => {
    setPinnedState(true);
    scrollToBottom();
  }, [scrollToBottom, setPinnedState]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return undefined;

    const onScroll = (): void => {
      const distanceFromBottom =
        element.scrollHeight - element.scrollTop - element.clientHeight;
      setPinnedState(distanceFromBottom <= BOTTOM_THRESHOLD_PX);
    };

    element.addEventListener("scroll", onScroll, { passive: true });
    return () => element.removeEventListener("scroll", onScroll);
  }, [setPinnedState]);

  return { containerRef, pinned, stickToBottom, scrollToBottom, pin };
}
