import { describe, expect, it } from "vitest";
import { sessionCookieOptions } from "./cookies.js";

describe("session cookies", () => {
  it("keeps JWTs HttpOnly and SameSite=Lax in local development", () => {
    const options = sessionCookieOptions();
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("lax");
    expect(options.path).toBe("/");
  });
});
