import { afterEach, describe, expect, it, vi } from "vitest";
import { UnconfiguredAnalysisRunner } from "./UnconfiguredAnalysisRunner.js";

describe("analysis runner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never executes submitted code in the API process", async () => {
    const sentinel = "__Ken_ANALYSIS_EXECUTED";
    (globalThis as Record<string, unknown>)[sentinel] = false;
    const runner = new UnconfiguredAnalysisRunner();
    await expect(
      runner.submit({
        userId: "u1",
        language: "python",
        code: `${sentinel} = true`,
      }),
    ).rejects.toMatchObject({ code: "ANALYSIS_SANDBOX_NOT_CONFIGURED" });
    expect((globalThis as Record<string, unknown>)[sentinel]).toBe(false);
  });

  // External job submission, status polling, ownership, and persistence are
  // covered against real MongoDB in ExternalAnalysisRunner.integration.test.ts.
});
