import { memo, useEffect, useRef, useState } from "react";
import { Code2 } from "lucide-react";

export interface GenerationEstimate {
  /** Median duration of comparable past runs, in milliseconds. */
  estimatedMs: number;
  /** How many past runs that median came from. */
  samples: number;
  /** False when a deep-code turn is priced off general-mode samples. */
  matchedMode: boolean;
}

interface CodeGenerationTickerProps {
  /** Absent until the server's estimate event lands, or when history is too thin. */
  estimate?: GenerationEstimate;
}

/** Thin history makes a precise figure dishonest, so the copy softens instead. */
const CONFIDENT_SAMPLE_COUNT = 8;

function formatSeconds(ms: number): string {
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

/**
 * Progress line for a deep code turn.
 *
 * The elapsed counter starts immediately; the estimate is filled in when the
 * server's `estimate` event arrives, so nothing is invented while waiting. Once
 * elapsed passes the estimate the wording drops the figure rather than counting
 * into a negative remainder — an estimate that has been overtaken is no longer
 * information worth showing.
 */
export const CodeGenerationTicker = memo(function CodeGenerationTicker({
  estimate,
}: CodeGenerationTickerProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    startedAtRef.current = Date.now();
    const handle = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 100);
    return () => window.clearInterval(handle);
  }, []);

  const overrun = estimate !== undefined && elapsedMs > estimate.estimatedMs;
  const progress =
    estimate === undefined || estimate.estimatedMs <= 0
      ? 0
      : Math.min(1, elapsedMs / estimate.estimatedMs);

  let detail: string;
  if (estimate === undefined) {
    detail = `${formatSeconds(elapsedMs)} elapsed`;
  } else if (overrun) {
    detail = `${formatSeconds(elapsedMs)} elapsed — longer than usual`;
  } else {
    const hedge = estimate.matchedMode && estimate.samples >= CONFIDENT_SAMPLE_COUNT ? "~" : "roughly ";
    detail = `${formatSeconds(elapsedMs)} elapsed · Estimated time: ${hedge}${formatSeconds(estimate.estimatedMs)}`;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Generating code"
      className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-4 py-3"
    >
      <div className="flex items-center gap-2 text-sm">
        <Code2 className="size-4 shrink-0 text-accent" aria-hidden="true" />
        <span className="font-medium">Generating high-performance code…</span>
      </div>
      <p className="text-xs text-fg-muted tabular-nums">{detail}</p>
      {estimate !== undefined && !overrun ? (
        <div className="h-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-100 ease-linear"
            style={{ width: `${(progress * 100).toFixed(1)}%` }}
          />
        </div>
      ) : null}
    </div>
  );
});

export default CodeGenerationTicker;
