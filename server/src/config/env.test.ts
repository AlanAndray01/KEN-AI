import { describe, expect, it } from "vitest";
import { applyEnvAliases, envSchema } from "./env.js";

const productionBase = {
  NODE_ENV: "production",
  JWT_SECRET: "a-real-production-secret-value",
  MONGODB_URI: "mongodb://localhost:27017/Ken",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Ken <noreply@ken-ai.tech>",
};

function issuePaths(input: Record<string, unknown>): string[] {
  const result = envSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.path.join("."));
}

describe("environment validation", () => {
  it("accepts a fully configured production environment", () => {
    expect(envSchema.safeParse(productionBase).success).toBe(true);
  });

  it("refuses to boot production without JWT_SECRET", () => {
    const { JWT_SECRET: _omitted, ...withoutSecret } = productionBase;

    expect(issuePaths(withoutSecret)).toContain("JWT_SECRET");
  });

  it("refuses to boot production without MONGODB_URI", () => {
    const { MONGODB_URI: _omitted, ...withoutUri } = productionBase;

    expect(issuePaths(withoutUri)).toContain("MONGODB_URI");
  });

  it("accepts MONGO_URI as an alias for MONGODB_URI", () => {
    const { MONGODB_URI: _omitted, ...withoutCanonical } = productionBase;
    const aliased = applyEnvAliases({ ...withoutCanonical, MONGO_URI: "mongodb://atlas.example/ken" });

    expect(envSchema.safeParse(aliased).success).toBe(true);
    expect(aliased.MONGODB_URI).toBe("mongodb://atlas.example/ken");
  });

  it("keeps MONGODB_URI when both Mongo names are set", () => {
    const aliased = applyEnvAliases({
      ...productionBase,
      MONGO_URI: "mongodb://ignored.example/ken",
    });

    expect(aliased.MONGODB_URI).toBe(productionBase.MONGODB_URI);
  });

  it("reads PORT from the process string Render injects", () => {
    const result = envSchema.safeParse({ ...productionBase, PORT: "10000" });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.PORT).toBe(10000);
  });

  it("allows production to boot without GEMINI_API_KEY so chat can return a clear 503", () => {
    const result = envSchema.safeParse(productionBase);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.GEMINI_API_KEY).toBeUndefined();
  });

  it("treats an empty JWT_SECRET as missing in production", () => {
    expect(issuePaths({ ...productionBase, JWT_SECRET: "" })).toContain("JWT_SECRET");
  });

  it("rejects a JWT_SECRET that is too short to be safe", () => {
    expect(issuePaths({ ...productionBase, JWT_SECRET: "tooshort" })).toContain("JWT_SECRET");
  });

  it("still allows development to run without a configured secret", () => {
    const result = envSchema.safeParse({ NODE_ENV: "development" });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.JWT_SECRET).toBeUndefined();
    }
  });

  it("accepts a named From address for Resend", () => {
    const named = "Ken <onboarding@resend.dev>";
    expect(envSchema.safeParse({ NODE_ENV: "development", RESEND_FROM_EMAIL: named }).success).toBe(true);
    expect(envSchema.safeParse({ NODE_ENV: "development", EMAIL_FROM: named }).success).toBe(true);
    expect(envSchema.safeParse({ NODE_ENV: "development", EMAIL_FROM: "not-an-email" }).success).toBe(false);
  });

  it("refuses to boot production without Resend mail settings", () => {
    const { RESEND_API_KEY: _key, EMAIL_FROM: _from, ...withoutMail } = productionBase;
    expect(issuePaths(withoutMail)).toEqual(expect.arrayContaining(["RESEND_API_KEY", "EMAIL_FROM"]));
    expect(issuePaths({ ...withoutMail, RESEND_FROM_EMAIL: "Ken <noreply@ken-ai.tech>" })).toContain(
      "RESEND_API_KEY",
    );
    expect(
      envSchema.safeParse({
        ...withoutMail,
        RESEND_API_KEY: "re_test_key",
        RESEND_FROM_EMAIL: "Ken <noreply@ken-ai.tech>",
      }).success,
    ).toBe(true);
  });

  it("refuses to boot production with development auth tools or mock AI enabled", () => {
    expect(issuePaths({ ...productionBase, ENABLE_DEV_AUTH_TOOLS: "true" })).toContain("ENABLE_DEV_AUTH_TOOLS");
    expect(issuePaths({ ...productionBase, ENABLE_MOCK_AI: "true" })).toContain("ENABLE_MOCK_AI");
  });
});
