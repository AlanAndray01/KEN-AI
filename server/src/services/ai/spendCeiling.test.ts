import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../../utils/AppError.js";
import { assertUnderSpendCeilingForTest, recordSpend, resetSpendCeilingForTest } from "./spendCeiling.js";

describe("spend ceiling", () => {
  afterEach(() => {
    resetSpendCeilingForTest();
  });

  it("never blocks a bring-your-own-key generation", async () => {
    await recordSpend("user-1", "user", 10_000_000);
    await assertUnderSpendCeilingForTest("user-1", "user");
  });

  it("allows a platform-key generation under the ceiling", async () => {
    await recordSpend("user-2", "environment", 1_000);
    await assertUnderSpendCeilingForTest("user-2", "environment");
  });

  it("blocks a platform-key generation once today's total reaches the ceiling", async () => {
    await recordSpend("user-3", "environment", 250_000);

    await expect(assertUnderSpendCeilingForTest("user-3", "environment")).rejects.toMatchObject({
      code: "SPEND_CEILING_REACHED",
    });
  });

  it("keeps a running total across multiple recorded generations", async () => {
    await recordSpend("user-4", "database", 150_000);
    await assertUnderSpendCeilingForTest("user-4", "database");

    await recordSpend("user-4", "database", 150_000);

    await expect(assertUnderSpendCeilingForTest("user-4", "database")).rejects.toBeInstanceOf(AppError);
  });
});
