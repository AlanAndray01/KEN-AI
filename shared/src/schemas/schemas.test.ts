import { describe, expect, it } from "vitest";
import {
  imageGenerationSchema,
  listConversationsQuerySchema,
  listGptsQuerySchema,
  listMemoriesQuerySchema,
  listMessagesQuerySchema,
  passwordSchema,
} from "./index.js";
import { MAX_IMAGE_PROMPT_CHARS } from "../constants/index.js";

describe("passwordSchema", () => {
  it("requires at least 8 characters for a new password", () => {
    expect(passwordSchema.safeParse("abcdefgh").success).toBe(true);
    expect(passwordSchema.safeParse("abcdefg").success).toBe(false);
    expect(passwordSchema.safeParse("correct-horse-battery").success).toBe(true);
    expect(passwordSchema.safeParse("short").success).toBe(false);
  });
});

describe("listMessagesQuerySchema", () => {
  it("coerces limit and includeSuperseded from query strings", () => {
    expect(
      listMessagesQuerySchema.parse({ limit: "32", before: "m1", includeSuperseded: "true" }),
    ).toEqual({ limit: 32, before: "m1", includeSuperseded: true });
  });

  it("defaults includeSuperseded to false and omits empty params", () => {
    expect(listMessagesQuerySchema.parse({})).toEqual({ includeSuperseded: false });
    expect(listMessagesQuerySchema.parse({ limit: "", before: "  ", includeSuperseded: "" })).toEqual({
      includeSuperseded: false,
    });
  });

  it("rejects a non-integer or out-of-range limit", () => {
    expect(listMessagesQuerySchema.safeParse({ limit: "nope" }).success).toBe(false);
    expect(listMessagesQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(listMessagesQuerySchema.safeParse({ limit: "201" }).success).toBe(false);
  });
});

describe("listConversationsQuerySchema", () => {
  it("treats archived=true as a boolean flag", () => {
    expect(listConversationsQuerySchema.parse({ archived: "true", limit: "10" })).toEqual({
      archived: true,
      limit: 10,
    });
    expect(listConversationsQuerySchema.parse({}).archived).toBe(false);
  });
});

describe("listMemoriesQuerySchema", () => {
  it("accepts a limit in 1..100", () => {
    expect(listMemoriesQuerySchema.parse({ limit: "40" })).toEqual({ limit: 40 });
    expect(listMemoriesQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
  });
});

describe("listGptsQuerySchema", () => {
  it("accepts known scopes and categories", () => {
    expect(listGptsQuerySchema.parse({ scope: "usable", q: "writer", category: "writing" })).toEqual({
      scope: "usable",
      q: "writer",
      category: "writing",
    });
  });

  it("rejects an unknown scope instead of silently dropping it", () => {
    expect(listGptsQuerySchema.safeParse({ scope: "everyone" }).success).toBe(false);
  });
});

describe("imageGenerationSchema", () => {
  it("caps prompts at the Flux 2048-character limit", () => {
    expect(imageGenerationSchema.parse({ prompt: "a cat" }).prompt).toBe("a cat");
    expect(imageGenerationSchema.safeParse({ prompt: "a".repeat(MAX_IMAGE_PROMPT_CHARS) }).success).toBe(true);
    expect(imageGenerationSchema.safeParse({ prompt: "a".repeat(MAX_IMAGE_PROMPT_CHARS + 1) }).success).toBe(false);
  });
});
