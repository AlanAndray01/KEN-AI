import { afterEach, describe, expect, it } from "vitest";
import type { AuthUser } from "@/contexts/auth-context";
import { readCachedAuthUser, writeCachedAuthUser } from "./authCache";

const sample: AuthUser = {
  id: "u1",
  name: "Ada",
  email: "ada@example.com",
  role: "user",
  preferences: { theme: "dark", language: "en", sendOnEnter: true },
};

afterEach(() => {
  sessionStorage.clear();
});

describe("authCache", () => {
  it("round-trips a public user and never stores tokens", () => {
    writeCachedAuthUser(sample);
    expect(sessionStorage.getItem("Ken.authUser")).not.toMatch(/token|cookie|password/i);
    expect(readCachedAuthUser()).toEqual(sample);
  });

  it("clears on null and rejects a malformed hint", () => {
    writeCachedAuthUser(sample);
    writeCachedAuthUser(null);
    expect(readCachedAuthUser()).toBeNull();

    sessionStorage.setItem("Ken.authUser", "{\"email\":\"no-id\"}");
    expect(readCachedAuthUser()).toBeNull();
  });
});
