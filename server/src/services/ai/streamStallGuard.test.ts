import { describe, expect, it, vi } from "vitest";
import { AppError } from "../../utils/AppError.js";
import type { StreamEvent } from "./AIProvider.js";
import { guardStreamStalls, STALL_LIMITS, stallLimitsFor } from "./streamStallGuard.js";

const LIMITS = { firstOutputMs: 40, idleMs: 40 };

/** A provider stream that sends `before`, then goes silent until aborted. */
async function* silentAfter(before: StreamEvent[], signal: AbortSignal): AsyncGenerator<StreamEvent> {
  yield* before;
  await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

async function drain(source: AsyncIterable<StreamEvent>) {
  const events: StreamEvent[] = [];
  let failure: unknown;
  try {
    for await (const event of source) events.push(event);
  } catch (error) {
    failure = error;
  }
  return { events, failure };
}

describe("guardStreamStalls", () => {
  it("passes a healthy stream through untouched", async () => {
    const onStall = vi.fn();
    async function* healthy(): AsyncGenerator<StreamEvent> {
      yield { type: "chunk", text: "Hello" };
      yield { type: "complete", response: { content: "Hello", model: "m", provider: "p", finishReason: "stop" } };
    }
    const run = await drain(guardStreamStalls(healthy(), LIMITS, onStall));
    expect(run.failure).toBeUndefined();
    expect(run.events.map((event) => event.type)).toEqual(["chunk", "complete"]);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("gives up on a provider that never starts, and aborts its request", async () => {
    const controller = new AbortController();
    const run = await drain(
      guardStreamStalls(silentAfter([{ type: "connected", model: "m", provider: "p" }], controller.signal), LIMITS, (error) =>
        controller.abort(error),
      ),
    );
    expect(controller.signal.aborted).toBe(true);
    expect(run.failure).toBeInstanceOf(AppError);
    expect((run.failure as AppError).code).toBe("PROVIDER_UNAVAILABLE");
    expect((run.failure as AppError).extra).toMatchObject({ errorClass: "stream_stall", sawOutput: false });
  });

  it("keeps the text that already arrived when a stream dies midway", async () => {
    const controller = new AbortController();
    const run = await drain(
      guardStreamStalls(silentAfter([{ type: "chunk", text: "Half" }], controller.signal), LIMITS, (error) =>
        controller.abort(error),
      ),
    );
    expect(run.events).toEqual([{ type: "chunk", text: "Half" }]);
    expect((run.failure as AppError).extra).toMatchObject({ sawOutput: true });
    expect((run.failure as AppError).message).toContain("kept");
  });

  it("waits longer before the first word on a thinking turn than on a fast one", () => {
    expect(stallLimitsFor("none").firstOutputMs).toBe(STALL_LIMITS.fastFirstOutputMs);
    expect(stallLimitsFor(undefined).firstOutputMs).toBe(STALL_LIMITS.thinkingFirstOutputMs);
    expect(STALL_LIMITS.thinkingFirstOutputMs).toBeGreaterThan(STALL_LIMITS.fastFirstOutputMs);
  });
});
