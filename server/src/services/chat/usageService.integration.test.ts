import mongoose from "mongoose";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { clearDatabase, explainSkip, stopInMemoryMongo, tryStartInMemoryMongo } from "../../test/mongoHarness.js";
import { UsageRecord } from "../../models/index.js";
import { summarizeUsage } from "./usageService.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "usage summary (real MongoDB)");

describe.skipIf(!mongo.ok)("summarizeUsage against real MongoDB", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  afterAll(async () => {
    await stopInMemoryMongo();
  });

  it("totals only the requested user's rows when given a string id", async () => {
    const mine = new mongoose.Types.ObjectId().toString();
    const theirs = new mongoose.Types.ObjectId().toString();
    const row = { providerId: "groq", modelId: "m1", requestCount: 1, durationMs: 10, success: true, route: "chat" };
    await UsageRecord.create([
      { ...row, userId: mine, inputTokens: 100, outputTokens: 20 },
      { ...row, userId: mine, inputTokens: 50, outputTokens: 5 },
      { ...row, userId: theirs, inputTokens: 999, outputTokens: 999 },
    ]);

    const summary = await summarizeUsage({ userId: mine });

    expect(summary.totals).toMatchObject({ requests: 2, inputTokens: 150, outputTokens: 25 });
    expect(summary.byProvider[0]).toMatchObject({ providerId: "groq", requests: 2 });
    expect(summary.byModel[0]).toMatchObject({ modelId: "m1", requests: 2 });
  });
});
