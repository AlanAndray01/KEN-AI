import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearDatabase, explainSkip, stopInMemoryMongo, tryStartInMemoryMongo } from "../../test/mongoHarness.js";
import { SpendBudget } from "../../models/SpendBudget.js";
import { reserveSpend, reconcileSpend, withSpendBudget } from "./spendCeiling.js";
import type { AIProvider } from "./AIProvider.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "atomic spend reservations");
describe.skipIf(!mongo.ok)("atomic spend reservations", () => {
  beforeEach(clearDatabase);
  afterAll(stopInMemoryMongo);
  it("admits only one of two concurrent requests that would exceed the budget", async () => {
    const results = await Promise.allSettled([reserveSpend("a", "environment", 150_000), reserveSpend("a", "database", 150_000)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(await SpendBudget.findOne()).toMatchObject({ tokens: 150_000 });
  });
  it("reconciles known usage and retains uncertain costs", async () => {
    const reservation = await reserveSpend("a", "environment", 100_000);
    await reconcileSpend(reservation, { inputTokens: 100, outputTokens: 200 });
    expect(await SpendBudget.findOne()).toMatchObject({ tokens: 300 });
    const uncertain = await reserveSpend("a", "environment", 100_000);
    await reconcileSpend(uncertain);
    expect(await SpendBudget.findOne()).toMatchObject({ tokens: 100_300 });
    expect(await reserveSpend("a", "user", 1_000_000)).toBeNull();
  });
  it("does not dispatch when authoritative accounting fails", async () => {
    const generate = vi.fn();
    const adapter = withSpendBudget({ generate } as unknown as AIProvider, "a", "environment", true);
    const update = vi.spyOn(SpendBudget, "updateOne").mockRejectedValueOnce(new Error("database unavailable"));
    await expect(adapter.generate({ providerId: "groq", modelId: "m", messages: [] })).rejects.toMatchObject({ code: "SPEND_ACCOUNTING_UNAVAILABLE" });
    expect(generate).not.toHaveBeenCalled();
    update.mockRestore();
  });
});
