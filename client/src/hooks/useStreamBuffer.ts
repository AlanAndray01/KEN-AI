import { useCallback, useEffect, useRef } from "react";

/**
 * Batches high-frequency stream tokens to one paint per animation frame
 * so token floods do not force a layout recalc on every chunk.
 */
export function useStreamBuffer(apply: (text: string) => void): {
  push: (text: string) => void;
  flush: () => void;
  reset: () => void;
} {
  const pendingRef = useRef("");
  const rafRef = useRef<number | undefined>(undefined);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const flush = useCallback(() => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    const text = pendingRef.current;
    pendingRef.current = "";
    if (text) applyRef.current(text);
  }, []);

  const push = useCallback(
    (text: string) => {
      if (!text) return;
      pendingRef.current += text;
      if (rafRef.current !== undefined) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = undefined;
        const next = pendingRef.current;
        pendingRef.current = "";
        if (next) applyRef.current(next);
      });
    },
    [],
  );

  const reset = useCallback(() => {
    if (rafRef.current !== undefined) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
    pendingRef.current = "";
  }, []);

  useEffect(() => () => reset(), [reset]);

  return { push, flush, reset };
}
