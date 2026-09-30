import { AppError } from "../../utils/AppError.js";
import type { StreamEvent } from "./AIProvider.js";

/**
 * How long a provider stream may stay silent before the turn gives up on it.
 *
 * The SSE heartbeat keeps the browser connection open during silence, so the
 * client's own idle watchdog never fires; before this guard, a provider that
 * accepted the request and then stopped sending left the reply spinning until
 * the ten-minute generation timeout.
 *
 * - Before the first visible text, a fast turn (thinking switched off) has no
 *   reason to be quiet for long. A thinking turn — math, code, a request for
 *   depth — may legitimately reason for a while first.
 * - Once text is flowing, a long gap means the stream has died.
 */
export const STALL_LIMITS = {
  fastFirstOutputMs: 25_000,
  thinkingFirstOutputMs: 90_000,
  betweenChunksMs: 45_000,
} as const;

export function stallLimitsFor(reasoningEffort: string | undefined): { firstOutputMs: number; idleMs: number } {
  return {
    firstOutputMs:
      reasoningEffort === "none" ? STALL_LIMITS.fastFirstOutputMs : STALL_LIMITS.thinkingFirstOutputMs,
    idleMs: STALL_LIMITS.betweenChunksMs,
  };
}

/** Retryable (503), so an Auto turn that stalls before any text hops to another model. */
export function streamStallError(sawOutput: boolean, waitedMs: number): AppError {
  return new AppError(
    sawOutput
      ? "The model stopped responding partway through its reply. The part it sent is kept."
      : "The model did not start replying in time.",
    {
      statusCode: 503,
      code: "PROVIDER_UNAVAILABLE",
      expose: true,
      extra: { httpStatus: 503, errorClass: "stream_stall", waitedMs, sawOutput },
    },
  );
}

/**
 * Passes a provider stream through, throwing a stall error when the next
 * event takes longer than its limit.
 *
 * `onStall` must abort the underlying request, so the provider's fetch is torn
 * down rather than left holding a socket. The source iterator is released
 * without awaiting it: an async generator queues `return()` behind its pending
 * `next()`, and that `next()` is the one that is stuck.
 */
export async function* guardStreamStalls(
  source: AsyncIterable<StreamEvent>,
  limits: { firstOutputMs: number; idleMs: number },
  onStall: (error: AppError) => void,
): AsyncGenerator<StreamEvent> {
  const iterator = source[Symbol.asyncIterator]();
  let sawOutput = false;
  let finished = false;
  try {
    while (true) {
      const limit = sawOutput ? limits.idleMs : limits.firstOutputMs;
      let timer: NodeJS.Timeout | undefined;
      const stalled = new Promise<"stalled">((resolve) => {
        timer = setTimeout(() => resolve("stalled"), limit);
      });
      const pending = iterator.next();
      const result = await Promise.race([pending, stalled]).finally(() => clearTimeout(timer));
      if (result === "stalled") {
        // The abandoned read will settle (or reject) once onStall aborts it.
        pending.catch(() => undefined);
        const error = streamStallError(sawOutput, limit);
        onStall(error);
        throw error;
      }
      if (result.done) {
        finished = true;
        return;
      }
      if (result.value.type === "chunk" || result.value.type === "complete") sawOutput = true;
      yield result.value;
    }
  } finally {
    if (!finished) void iterator.return?.(undefined)?.catch(() => undefined);
  }
}
