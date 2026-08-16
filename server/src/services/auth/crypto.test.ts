import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./crypto.js";
import { signAccessToken, verifyAccessToken } from "./tokens.js";

describe("auth crypto", () => {
  it("hashes and verifies passwords with argon2id", async () => {
    const hash = await hashPassword("a-very-long-password");
    expect(hash).not.toContain("a-very-long-password");
    expect(await verifyPassword(hash, "a-very-long-password")).toBe(true);
    expect(await verifyPassword(hash, "wrong-password")).toBe(false);
  });
});

describe("access tokens", () => {
  it("signs and verifies a session-bound JWT", async () => {
    const token = await signAccessToken({ sub: "user1", sid: "session1", role: "user" });
    const payload = await verifyAccessToken(token);
    expect(payload).toMatchObject({ sub: "user1", sid: "session1", role: "user" });
  });
});
