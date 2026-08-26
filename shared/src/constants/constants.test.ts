import { describe, expect, it } from "vitest";
import {
  APP_NAME,
  API_ROUTES,
  AUTH_PROVIDERS,
  CLIENT_ROUTES,
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  estimatePromptTokens,
  resolveGroqModelId,
  USER_ROLES,
} from "./index.js";

describe("shared constants", () => {
  it("uses the Ken product name", () => {
    expect(APP_NAME).toBe("Ken AI");
  });

  it("defaults chat inference to Groq GPT OSS 20B, with OpenAI as the documented hop", () => {
    expect(DEFAULT_GROQ_MODEL_ID).toBe("openai/gpt-oss-20b");
    expect(GROQ_QUALITY_MODEL_ID).toBe("openai/gpt-oss-120b");
    expect(DEFAULT_OPENAI_MODEL_ID).toBe("gpt-4o-mini");
    expect(resolveGroqModelId("llama-3.3-70b-versatile")).toBe("openai/gpt-oss-120b");
    expect(resolveGroqModelId("openai/gpt-oss-20b")).toBe("openai/gpt-oss-20b");
  });

  it("estimates prompt tokens at about four characters each", () => {
    expect(estimatePromptTokens("")).toBe(0);
    expect(estimatePromptTokens("abcd")).toBe(1);
    expect(estimatePromptTokens("abcdefgh")).toBe(2);
  });

  it("defines local and Google auth providers", () => {
    expect(AUTH_PROVIDERS).toEqual(["local", "google"]);
  });

  it("defines user and admin roles", () => {
    expect(USER_ROLES).toEqual(["user", "admin"]);
  });

  it("exposes provider and model API routes", () => {
    expect(API_ROUTES.models).toBe("/models");
    expect(API_ROUTES.providers).toBe("/providers");
    expect(API_ROUTES.admin.providers).toBe("/admin/providers");
    expect(API_ROUTES.me.providerCredentials).toBe("/me/provider-credentials");
    expect(API_ROUTES.me.providerCredentialTest).toBe("/me/provider-credentials/:providerId/test");
    expect(API_ROUTES.settings.keys).toBe("/settings/keys");
    expect(API_ROUTES.conversations).toBe("/conversations");
    expect(API_ROUTES.chat).toBe("/chat");
    expect(API_ROUTES.files).toBe("/files");
    expect(API_ROUTES.tools).toBe("/tools");
    expect(API_ROUTES.voice).toBe("/voice");
    expect(API_ROUTES.analysis).toBe("/analysis");
    expect(API_ROUTES.memories).toBe("/memories");
    expect(API_ROUTES.gpts).toBe("/gpts");
    expect(API_ROUTES.me.instructions).toBe("/me/instructions");
    expect(API_ROUTES.share).toBe("/share");
    expect(API_ROUTES.notifications).toBe("/notifications");
    expect(API_ROUTES.admin.usage).toBe("/admin/usage");
    expect(API_ROUTES.auth.verifyEmail).toBe("/auth/verify-email");
    expect(API_ROUTES.auth.resendCode).toBe("/auth/resend-code");
  });

  it("aliases /history onto the search surface", () => {
    expect(CLIENT_ROUTES.history).toBe("/history");
    expect(CLIENT_ROUTES.search).toBe("/search");
  });
});
