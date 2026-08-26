import { afterEach, describe, expect, it } from "vitest";
import { AppError } from "../../utils/AppError.js";
import {
  consumePlatformChatQuota,
  consumePlatformChatQuotaForTest,
  resetPlatformChatQuota,
} from "./platformChatQuota.js";

describe("platform chat quota", () => {
  afterEach(() => {
    resetPlatformChatQuota();
  });

  it("does not consume quota when the user brought their own key", () => {
    consumePlatformChatQuota("user-1", "user");
    consumePlatformChatQuota("user-1", "user");
  });

  it("skips the limiter in NODE_ENV=test unless forced", () => {
    for (let i = 0; i < 50; i += 1) {
      consumePlatformChatQuota("user-2", "environment");
    }
  });

  it("rejects after the platform max when forced in tests", () => {
    let sawLimit = false;
    for (let i = 0; i < 40; i += 1) {
      try {
        consumePlatformChatQuotaForTest("user-3");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe("RATE_LIMITED");
        sawLimit = true;
        break;
      }
    }
    expect(sawLimit).toBe(true);
  });
});
