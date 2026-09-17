import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../../utils/AppError.js";
import { recordFailedLoginForTest, resetLoginFailures } from "./loginLockout.js";

describe("login lockout", () => {
  afterEach(() => {
    resetLoginFailures();
  });

  it("locks an IP after 5 failed attempts", async () => {
    let locked = false;
    for (let i = 0; i < 8; i += 1) {
      try {
        await recordFailedLoginForTest("10.0.0.9");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe("RATE_LIMITED");
        locked = true;
        break;
      }
    }
    expect(locked).toBe(true);
  });
});
