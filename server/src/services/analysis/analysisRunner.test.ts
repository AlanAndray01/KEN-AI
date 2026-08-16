import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalAnalysisRunner, resetAnalysisJobsForTests } from "./ExternalAnalysisRunner.js";
import { UnconfiguredAnalysisRunner } from "./UnconfiguredAnalysisRunner.js";

describe("analysis runner", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetAnalysisJobsForTests();
  });

  it("never executes submitted code in the API process", async () => {
    const sentinel = "__AETHER_ANALYSIS_EXECUTED";
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

  it("forwards jobs to an isolated runner URL instead of eval", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);
    const runner = new ExternalAnalysisRunner("http://analysis-runner.local");
    const job = await runner.submit({
      userId: "u1",
      language: "python",
      code: "print(1)",
    });
    expect(job.status).toBe("queued");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as { code: string };
    expect(body.code).toBe("print(1)");
  });
});
