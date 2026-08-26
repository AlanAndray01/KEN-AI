/**
 * Pre-token indicator for an assistant turn that has started but has not yet
 * streamed any text.
 *
 * It deliberately claims nothing about what the model is doing. The previous
 * version cycled "Style → Format → Check" on a 700ms timer with no connection to
 * the request, which invented analysis stages that never ran — the kind of
 * fabricated progress the project's no-fake-features rule exists to prevent.
 *
 * The only honest signals available on the client are elapsed time and whether
 * tokens have arrived, so those are the only things shown.
 */

import { useEffect, useState } from "react";

/** Below this, the indicator stays a bare shimmer with no wording. */
const SLOW_AFTER_MS = 2500;

export function ThinkingPipeline() {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, 500);
    return () => window.clearInterval(id);
  }, []);

  const isSlow = elapsedMs >= SLOW_AFTER_MS;

  return (
    <div className="thinking-pipeline" role="status" aria-live="polite" aria-label="Generating response">
      <span className="thinking-shimmer" aria-hidden="true">
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </span>
      {isSlow ? (
        <span className="thinking-elapsed">{Math.round(elapsedMs / 1000)}s</span>
      ) : null}
    </div>
  );
}
