import { describe, expect, it } from "vitest";
import { AIProvider } from "./AIProvider.js";
import { PasswordReset } from "./PasswordReset.js";
import { User } from "./User.js";
import { UserProviderCredential } from "./UserProviderCredential.js";
import { VerificationToken } from "./VerificationToken.js";

describe("model JSON serialization", () => {
  it("never includes passwordHash on User JSON", () => {
    const user = new User({
      name: "Ada",
      email: "ada@example.com",
      passwordHash: "should-not-leak",
    });

    const json = user.toJSON();
    expect(json).not.toHaveProperty("passwordHash");
    expect(json.email).toBe("ada@example.com");
    expect(JSON.stringify(json)).not.toContain("should-not-leak");
  });

  it("never includes encryptedApiKey on AIProvider JSON", () => {
    const provider = new AIProvider({
      providerId: "gemini",
      name: "Google Gemini",
      type: "gemini",
      encryptedApiKey: "should-not-leak",
      keyLastFour: "ab12",
    });

    const json = provider.toJSON();
    expect(json).not.toHaveProperty("encryptedApiKey");
    expect(json.keyLastFour).toBe("ab12");
    expect(JSON.stringify(json)).not.toContain("should-not-leak");
  });

  it("never includes encryptedApiKey on UserProviderCredential JSON", () => {
    const credential = new UserProviderCredential({
      userId: "000000000000000000000001",
      providerId: "gemini",
      encryptedApiKey: "should-not-leak",
      keyLastFour: "zzzz",
    });

    const json = credential.toJSON();
    expect(json).not.toHaveProperty("encryptedApiKey");
    expect(json.keyLastFour).toBe("zzzz");
    expect(JSON.stringify(json)).not.toContain("should-not-leak");
  });

  it("never includes codeHash on VerificationToken JSON", () => {
    const token = new VerificationToken({
      userId: "000000000000000000000001",
      codeHash: "should-not-leak",
      expiresAt: new Date(),
    });

    const json = token.toJSON();
    expect(json).not.toHaveProperty("codeHash");
    expect(JSON.stringify(json)).not.toContain("should-not-leak");
  });

  it("never includes tokenHash on PasswordReset JSON", () => {
    const reset = new PasswordReset({
      userId: "000000000000000000000001",
      tokenHash: "should-not-leak",
      expiresAt: new Date(),
    });

    const json = reset.toJSON();
    expect(json).not.toHaveProperty("tokenHash");
    expect(JSON.stringify(json)).not.toContain("should-not-leak");
  });
});
