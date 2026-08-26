import { describe, expect, it } from "vitest";
import { passwordSchema } from "./index.js";

describe("passwordSchema", () => {
  it("accepts passwords of at least 6 characters", () => {
    expect(passwordSchema.safeParse("abcdef").success).toBe(true);
    expect(passwordSchema.safeParse("correct-horse-battery").success).toBe(true);
    expect(passwordSchema.safeParse("short").success).toBe(false);
  });
});
