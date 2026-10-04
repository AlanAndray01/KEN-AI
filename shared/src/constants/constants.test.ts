import { describe, expect, it } from "vitest";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  APP_NAME,
  DOCX_MIME_TYPE,
  API_ROUTES,
  AUTH_PROVIDERS,
  CLIENT_ROUTES,
  DEFAULT_GEMINI_MODEL_ID,
  DEFAULT_GROQ_MODEL_ID,
  DEFAULT_OPENAI_MODEL_ID,
  GEMINI_FLASH_LITE_MODEL_ID,
  GEMINI_IMAGE_MODEL_ID,
  GROQ_QUALITY_MODEL_ID,
  MAX_IMAGE_PROMPT_CHARS,
  estimatePromptTokens,
  isCloudflareImageModel,
  isLlamaModelId,
  CLOUDFLARE_IMAGE_MODEL_ID,
  modelCapabilityLabel,
  resolveGeminiModelId,
  resolveGroqModelId,
  resolveDeepSeekModelId,
  USER_ROLES,
} from "./index.js";

describe("shared constants", () => {
  it("keeps existing DeepSeek chat selections on the current Flash endpoint", () => {
    expect(resolveDeepSeekModelId("deepseek-chat")).toBe("deepseek-flash");
    expect(resolveDeepSeekModelId("deepseek-v4-flash")).toBe("deepseek-flash");
    expect(resolveDeepSeekModelId("deepseek-v4-pro")).toBe("deepseek-v4-pro");
  });
  it("uses the Ken product name", () => {
    expect(APP_NAME).toBe("Ken AI");
  });

  it("accepts Word documents alongside PDFs and text uploads", () => {
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("application/pdf");
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain(DOCX_MIME_TYPE);
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("text/plain");
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("text/markdown");
    expect(ALLOWED_UPLOAD_MIME_TYPES).toContain("text/csv");
  });

  it("defaults chat inference to Gemini 3.5 Flash Lite, with Groq Qwen as the documented hop", () => {
    expect(DEFAULT_GEMINI_MODEL_ID).toBe("gemini-3.5-flash-lite");
    expect(GEMINI_FLASH_LITE_MODEL_ID).toBe("gemini-3.5-flash-lite");
    expect(resolveGeminiModelId("gemini-2.5-flash")).toBe("gemini-3.5-flash-lite");
    expect(resolveGeminiModelId("gemini-2.5-flash-lite")).toBe("gemini-3.5-flash-lite");
    expect(resolveGeminiModelId("gemini-2.0-flash")).toBe("gemini-3.6-flash");
    expect(resolveGeminiModelId("gemini-1.5-flash")).toBe("gemini-3.5-flash-lite");
    expect(resolveGeminiModelId("gemini-1.5-pro")).toBe("gemini-3.1-pro-preview");
    expect(resolveGeminiModelId("gemini-3.8-flash")).toBe("gemini-3.8-flash");
    expect(resolveGeminiModelId("gemini-3.5-flash-lite")).toBe("gemini-3.5-flash-lite");
    expect(GEMINI_IMAGE_MODEL_ID).toBe("gemini-3.1-flash-image");
    expect(DEFAULT_GROQ_MODEL_ID).toBe("qwen/qwen3.8-27b");
    expect(GROQ_QUALITY_MODEL_ID).toBe("openai/gpt-oss-120b");
    expect(DEFAULT_OPENAI_MODEL_ID).toBe("gpt-4o-mini");
    expect(isLlamaModelId("llama-3.3-70b")).toBe(true);
    expect(isLlamaModelId("qwen/qwen3.8-27b")).toBe(false);
    // Cloudflare names every model it serves `@cf/meta/llama-...`, so a plain
    // substring test hid the whole provider from the picker.
    expect(isLlamaModelId("@cf/meta/llama-3.3-70b-instruct-fp8-fast")).toBe(false);
    expect(isLlamaModelId("@cf/meta/llama-4-scout-17b-16e-instruct")).toBe(false);
    expect(resolveGroqModelId("llama-3.3-70b-versatile")).toBe("openai/gpt-oss-120b");
    expect(resolveGroqModelId("llama-3.1-8b-instant")).toBe("qwen/qwen3.8-27b");
    expect(resolveGroqModelId("openai/gpt-oss-20b")).toBe("openai/gpt-oss-20b");
    // Retired when Groq moved to 3.8; stored conversations must still resolve.
    expect(resolveGroqModelId("qwen/qwen3.6-27b")).toBe("qwen/qwen3.8-27b");
  });

  it("labels each model by what it can actually do", () => {
    expect(modelCapabilityLabel({ id: "gemini-3.1-pro-preview", capabilities: ["text", "vision", "files", "tools"] })).toBe(
      "Vision & PDF Reader",
    );
    expect(
      modelCapabilityLabel({ id: "@cf/meta/llama-4-scout-17b-16e-instruct", capabilities: ["text", "vision"] }),
    ).toBe("Vision & PDF Reader");
    // The point of this model is the code, not that 32B is a large tier.
    expect(modelCapabilityLabel({ id: "@cf/qwen/qwen2.5-coder-32b-instruct", capabilities: ["text"] })).toBe(
      "Code & Deep Logic",
    );
    expect(modelCapabilityLabel({ id: "@cf/meta/llama-3.2-1b-instruct", capabilities: ["text"] })).toBe("Text & Chat");
    expect(modelCapabilityLabel({ id: "@cf/nvidia/nemotron-3-120b-a12b", capabilities: ["text", "tools"] })).toBe(
      "Code & Deep Logic",
    );
    expect(modelCapabilityLabel({ id: "@cf/aisingapore/gemma-sea-lion-v4-27b-it", capabilities: ["text"] })).toBe(
      "Text & Chat",
    );
    expect(
      modelCapabilityLabel({ id: "gemini-3.1-flash-image", capabilities: ["text", "imageGeneration"] }),
    ).toBe("Image Generation");
    expect(
      modelCapabilityLabel({ id: CLOUDFLARE_IMAGE_MODEL_ID, capabilities: ["imageGeneration"] }),
    ).toBe("Image Generation");
    expect(isCloudflareImageModel(CLOUDFLARE_IMAGE_MODEL_ID)).toBe(true);
    expect(isCloudflareImageModel("@cf/meta/llama-3.2-3b-instruct")).toBe(false);
    expect(MAX_IMAGE_PROMPT_CHARS).toBe(2048);
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
