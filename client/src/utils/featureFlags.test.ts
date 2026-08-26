import { describe, expect, it } from "vitest";
import { readBooleanFlag } from "./featureFlags";

describe("readBooleanFlag", () => {
  it("reads the documented true and false spellings", () => {
    expect(readBooleanFlag("true")).toBe(true);
    expect(readBooleanFlag("false")).toBe(false);
    expect(readBooleanFlag("1")).toBe(true);
    expect(readBooleanFlag("0")).toBe(false);
  });

  it("ignores surrounding whitespace and casing", () => {
    expect(readBooleanFlag("  TRUE  ")).toBe(true);
    expect(readBooleanFlag("False")).toBe(false);
  });

  it("returns undefined when unset, so the caller's default applies", () => {
    expect(readBooleanFlag(undefined)).toBeUndefined();
    expect(readBooleanFlag("")).toBeUndefined();
  });

  it("returns undefined for a value it cannot interpret", () => {
    // A typo must not be read as "on"; falling through to the build-mode
    // default is safer than guessing.
    expect(readBooleanFlag("yes")).toBeUndefined();
    expect(readBooleanFlag("off")).toBeUndefined();
  });
});
