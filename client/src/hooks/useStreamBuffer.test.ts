import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStreamBuffer } from "./useStreamBuffer";

/**
 * The hook exists to keep a reply typing out smoothly whatever shape the
 * provider sends it in, so these drive the animation frames by hand rather than
 * waiting on real ones.
 */
let frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;

beforeEach(() => {
  frames = new Map();
  nextFrameId = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    nextFrameId += 1;
    frames.set(nextFrameId, callback);
    return nextFrameId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Runs every frame queued so far, exactly once. */
function runFrame(): void {
  const queued = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of queued) callback(0);
  });
}

/** Runs frames until nothing more is scheduled, returning how many ran. */
function runUntilIdle(limit = 500): number {
  let ran = 0;
  while (frames.size > 0 && ran < limit) {
    runFrame();
    ran += 1;
  }
  return ran;
}

describe("useStreamBuffer", () => {
  it("paints nothing until a frame runs", () => {
    const applied: string[] = [];
    const { result } = renderHook(() => useStreamBuffer((text) => applied.push(text)));

    act(() => result.current.push("Hello"));
    expect(applied).toEqual([]);

    runFrame();
    expect(applied.join("")).not.toBe("");
  });

  it("spreads one big provider chunk across frames instead of dumping it", () => {
    const applied: string[] = [];
    const { result } = renderHook(() => useStreamBuffer((text) => applied.push(text)));
    const paragraph = "x".repeat(600);

    act(() => result.current.push(paragraph));
    runFrame();

    // The whole slab must not land in a single paint.
    expect(applied).toHaveLength(1);
    expect(applied[0]?.length).toBeLessThan(paragraph.length);
    expect(applied[0]?.length).toBeGreaterThan(0);

    runUntilIdle();
    expect(applied.length).toBeGreaterThan(1);
    expect(applied.join("")).toBe(paragraph);
  });

  it("keeps draining on its own, without waiting for another push", () => {
    const applied: string[] = [];
    const { result } = renderHook(() => useStreamBuffer((text) => applied.push(text)));

    act(() => result.current.push("y".repeat(300)));
    const framesRun = runUntilIdle();

    expect(framesRun).toBeGreaterThan(1);
    expect(applied.join("")).toBe("y".repeat(300));
  });

  it("never loses or reorders text across many uneven chunks", () => {
    const applied: string[] = [];
    const { result } = renderHook(() => useStreamBuffer((text) => applied.push(text)));
    const chunks = ["The ", "quick ", "brown ".repeat(40), "fox", "!".repeat(120)];

    for (const chunk of chunks) {
      act(() => result.current.push(chunk));
      runFrame();
    }
    runUntilIdle();

    expect(applied.join("")).toBe(chunks.join(""));
  });

  it("paints an outsized chunk whole rather than typing it out for seconds", () => {
    const applied: string[] = [];
    const { result } = renderHook(() => useStreamBuffer((text) => applied.push(text)));
    const dump = "z".repeat(5_000);

    act(() => result.current.push(dump));
    runFrame();

    expect(applied).toEqual([dump]);
  });

  it("flushes the whole backlog at once when the turn ends", () => {
    const applied: string[] = [];
    const { result } = renderHook(() => useStreamBuffer((text) => applied.push(text)));

    act(() => result.current.push("a".repeat(400)));
    runFrame();
    const painted = applied.join("").length;

    act(() => result.current.flush());

    // Nothing may be left behind once the reply is complete.
    expect(applied.join("")).toBe("a".repeat(400));
    expect(applied.join("").length).toBeGreaterThan(painted);
    expect(frames.size).toBe(0);
  });

  it("drops the backlog on reset, so a new turn cannot inherit it", () => {
    const applied: string[] = [];
    const { result } = renderHook(() => useStreamBuffer((text) => applied.push(text)));

    act(() => result.current.push("stale".repeat(50)));
    act(() => result.current.reset());
    runUntilIdle();

    expect(applied).toEqual([]);
    expect(frames.size).toBe(0);
  });

  it("does not split an emoji down the middle", () => {
    const applied: string[] = [];
    const { result } = renderHook(() => useStreamBuffer((text) => applied.push(text)));
    // Each thumbs-up is a surrogate pair, so a naive cut would emit half of one.
    const emoji = "👍".repeat(60);

    act(() => result.current.push(emoji));
    runUntilIdle();

    expect(applied.join("")).toBe(emoji);
    for (const piece of applied) {
      expect(piece).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(piece).not.toMatch(/^[\uDC00-\uDFFF]/);
    }
  });
});
