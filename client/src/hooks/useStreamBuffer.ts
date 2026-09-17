import { useCallback, useEffect, useRef } from "react";

/**
 * Paces stream tokens into one paint per animation frame.
 *
 * Two problems, one buffer. Providers do not emit evenly: Gemini and Groq both
 * send a trickle of small deltas and then, without warning, a single chunk
 * holding a whole paragraph. Painting every delta thrashes layout; painting a
 * 600-character chunk in one frame is the "block dump" that makes a reply land
 * in visible slabs instead of typing out.
 *
 * So a frame drains only part of the backlog. The share grows with the backlog,
 * which keeps the text honest about how far ahead the model is - a long tail
 * catches up quickly rather than trickling out for seconds after the stream is
 * done - while never dumping a slab in a single paint.
 */

/** Minimum characters per frame. Below this a long tail feels like lag, not typing. */
const MIN_CHARS_PER_FRAME = 4;

/** Drain this fraction of the backlog each frame, so a burst catches up fast. */
const BACKLOG_SHARE = 1 / 6;

/**
 * Past this, pacing stops and the whole backlog is painted at once. A reply that
 * arrives as one enormous chunk is a paste, not a stream; typing it out would
 * take longer than the model did.
 */
const PACING_CEILING = 4_000;

/** Never split inside a surrogate pair: half an emoji renders as a replacement box. */
function sliceAt(text: string, count: number): number {
  const index = Math.min(count, text.length);
  const code = text.charCodeAt(index - 1);
  // A high surrogate at the boundary means its partner is the next character.
  if (code >= 0xd800 && code <= 0xdbff && index < text.length) return index + 1;
  return index;
}

export function useStreamBuffer(apply: (text: string) => void): {
  push: (text: string) => void;
  flush: () => void;
  reset: () => void;
} {
  const pendingRef = useRef("");
  const rafRef = useRef<number | undefined>(undefined);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const cancelFrame = useCallback(() => {
    if (rafRef.current === undefined) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = undefined;
  }, []);

  /** Emits everything buffered now. Used when the turn ends, so nothing is held back. */
  const flush = useCallback(() => {
    cancelFrame();
    const text = pendingRef.current;
    pendingRef.current = "";
    if (text) applyRef.current(text);
  }, [cancelFrame]);

  const drain = useCallback(() => {
    rafRef.current = undefined;
    const pending = pendingRef.current;
    if (!pending) return;

    if (pending.length >= PACING_CEILING) {
      pendingRef.current = "";
      applyRef.current(pending);
      return;
    }

    const budget = Math.max(MIN_CHARS_PER_FRAME, Math.ceil(pending.length * BACKLOG_SHARE));
    const cut = sliceAt(pending, budget);
    pendingRef.current = pending.slice(cut);
    applyRef.current(pending.slice(0, cut));

    // Keep the frames coming while anything is still buffered; without this a
    // burst that arrives between frames would sit unpainted until the next push.
    if (pendingRef.current) {
      rafRef.current = requestAnimationFrame(drain);
    }
  }, []);

  const push = useCallback(
    (text: string) => {
      if (!text) return;
      pendingRef.current += text;
      if (rafRef.current !== undefined) return;
      rafRef.current = requestAnimationFrame(drain);
    },
    [drain],
  );

  const reset = useCallback(() => {
    cancelFrame();
    pendingRef.current = "";
  }, [cancelFrame]);

  useEffect(() => () => reset(), [reset]);

  return { push, flush, reset };
}
