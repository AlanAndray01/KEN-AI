import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, lastFour, maskSecret } from "./encryption.js";

describe("provider secret encryption", () => {
  it("round-trips a secret and never returns the plaintext from mask helpers", () => {
    const secret = "test-gemini-key-zzzz";
    const encrypted = encryptSecret(secret);

    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(encrypted)).toBe(secret);
    expect(maskSecret(secret)).toBe("••••zzzz");
    expect(lastFour(secret)).toBe("zzzz");
  });
});
