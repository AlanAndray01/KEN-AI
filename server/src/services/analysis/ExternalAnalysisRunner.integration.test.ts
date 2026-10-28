import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDatabase, explainSkip, stopInMemoryMongo, tryStartInMemoryMongo } from "../../test/mongoHarness.js";
import { ExternalAnalysisRunner } from "./ExternalAnalysisRunner.js";
import { File as StoredFile } from "../../models/File.js";
const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "external analysis persistence");
describe.skipIf(!mongo.ok)("external analysis persistence", () => {
  beforeEach(clearDatabase);
  afterEach(() => vi.unstubAllGlobals());
  afterAll(stopInMemoryMongo);
  it("returns output and retains it across instances without exposing another owner's job", async () => {
    const fetch = vi.fn(async () => Response.json({ status: "completed", output: "2" }));
    vi.stubGlobal("fetch", fetch);
    const job = await new ExternalAnalysisRunner("https://fixture.invalid").submit({
      userId: "000000000000000000000001", language: "python", code: "print(1+1)",
    });
    expect(job).toMatchObject({ status: "succeeded", output: "2" });
    expect(await new ExternalAnalysisRunner("https://fixture.invalid").get("000000000000000000000001", job.id)).toMatchObject({ output: "2" });
    await expect(new ExternalAnalysisRunner("https://fixture.invalid").get("000000000000000000000002", job.id)).rejects.toMatchObject({ statusCode: 404 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("polls queued jobs and rejects malformed runner responses", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ id: "upstream", status: "queued" }))
      .mockResolvedValueOnce(Response.json({ status: "running" }))
      .mockResolvedValueOnce(Response.json({ status: "succeeded", output: "done" }))
      .mockResolvedValueOnce(Response.json({ status: "invented" }));
    vi.stubGlobal("fetch", fetch);
    const runner = new ExternalAnalysisRunner("https://fixture.invalid");
    const input = { userId: "000000000000000000000001", language: "python" as const, code: "print(1)" };
    const job = await runner.submit(input);
    expect((await runner.get(input.userId, job.id)).status).toBe("running");
    expect(await runner.get(input.userId, job.id)).toMatchObject({ status: "succeeded", output: "done" });
    await expect(runner.submit(input)).rejects.toMatchObject({ code: "ANALYSIS_RUNNER_ERROR" });
  });
  it("never forwards another account's file IDs to the runner", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const file = await StoredFile.create({ userId: "000000000000000000000002", originalName: "private.csv",
      mimeType: "text/csv", size: 10, storageKey: "fixture/private" });
    await expect(new ExternalAnalysisRunner("https://fixture.invalid").submit({
      userId: "000000000000000000000001", language: "python", code: "print(1)", fileIds: [String(file._id)],
    })).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
