import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Load server/.env before any provider adapter (OpenAI-compatible Groq client included) is constructed.
dotenv.config({ path: path.join(serverDir, ".env") });

const emptyToUndefined = (value: unknown): unknown =>
  value === "" || value === undefined ? undefined : value;

/**
 * Hosts often set MONGO_URI (Atlas / Render) while Ken's canonical name is
 * MONGODB_URI. Prefer the canonical value when both are present.
 */
export function applyEnvAliases(source: Record<string, unknown>): Record<string, unknown> {
  const mongodb = typeof source.MONGODB_URI === "string" ? source.MONGODB_URI.trim() : "";
  const mongo = typeof source.MONGO_URI === "string" ? source.MONGO_URI.trim() : "";
  if (mongodb || !mongo) return source;
  return { ...source, MONGODB_URI: mongo };
}

const fromAddressSchema = z.string().trim().min(3).max(320).refine((value) => {
  const named = /<([^<>]+)>$/.exec(value);
  const candidate = (named?.[1] ?? value).trim();
  return z.string().email().safeParse(candidate).success;
}, { message: "Use an email address or Name <email@domain>" });

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  CLIENT_URL: z.string().min(1).default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  MONGODB_URI: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  JWT_SECRET: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  JWT_EXPIRES_IN: z.string().min(1).default("15m"),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default("7d"),
  GOOGLE_CLIENT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GOOGLE_CLIENT_SECRET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GOOGLE_CALLBACK_URL: z.string().min(1).default("http://localhost:5000/api/auth/google/callback"),
  INITIAL_ADMIN_EMAIL: z.preprocess(emptyToUndefined, z.string().email().optional()),
  ENABLE_DEV_AUTH_TOOLS: z.enum(["true", "false"]).default("false"),
  ENABLE_MOCK_AI: z.enum(["true", "false"]).default("false"),
  ENCRYPTION_KEY: z.preprocess(emptyToUndefined, z.string().min(16).optional()),
  GEMINI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  RESEND_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  RESEND_FROM_EMAIL: z.preprocess(emptyToUndefined, fromAddressSchema.optional()),
  EMAIL_FROM: z.preprocess(emptyToUndefined, fromAddressSchema.optional()),
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional()),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  SMTP_PASS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GROQ_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GROQ_KEYS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  CEREBRAS_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  CEREBRAS_KEYS: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  DEEPSEEK_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  DEEPSEEK_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  CF_ACCOUNT_ID: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  CF_TOKEN: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENROUTER_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  REDIS_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SENTRY_DSN: z.preprocess(emptyToUndefined, z.string().url().optional()),
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2", "cloudinary"]).default("local"),
  STORAGE_DIRECTORY: z.string().min(1).default("uploads"),
  FILE_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  STORAGE_BUCKET: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STORAGE_ACCESS_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STORAGE_SECRET_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STORAGE_REGION: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STORAGE_PUBLIC_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  STORAGE_ENDPOINT: z.preprocess(emptyToUndefined, z.string().url().optional()),
  SEARCH_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["tavily", "brave", "serper"]).optional()),
  SEARCH_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  IMAGE_GENERATION_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["openai", "gemini"]).optional()),
  IMAGE_GENERATION_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  VOICE_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["openai"]).optional()),
  VOICE_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  ANALYSIS_RUNNER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  AI_FALLBACK_PROVIDER_ID: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(64).optional()),
  AI_FALLBACK_MODEL_ID: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(160).optional()),
  COOKIE_DOMAIN: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_LOGIN_FAILURES: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60_000),
  RATE_LIMIT_CHAT: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_CHAT_PLATFORM: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_UPLOAD: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_SEARCH: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_IMAGE: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_VOICE: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PASSWORD_RESET: z.coerce.number().int().positive().default(5),
  /**
   * Daily token ceiling per user on shared platform keys (env or admin-
   * stored), not bring-your-own keys. 250k is a starting point sized well
   * under a typical free-tier daily provider quota (QUOTA_EXCEEDED_SKIP_MS
   * in modelSkip.ts exists because those quotas are themselves in this
   * range) so one heavy user cannot exhaust the shared quota for everyone
   * else; the /admin/usage dashboard shows real usage to recalibrate this
   * once there's traffic to look at. 0 disables the ceiling entirely.
   */
  AUTO_MODE_DAILY_TOKEN_CEILING: z.coerce.number().int().nonnegative().default(250_000),
});

export const envSchema = baseEnvSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV !== "production") return;

  // Production must never fall back to a generated or implicit secret.
  if (!value.JWT_SECRET) {
    ctx.addIssue({
      code: "custom",
      path: ["JWT_SECRET"],
      message: "JWT_SECRET is required in production (16+ characters)",
    });
  }
  if (!value.MONGODB_URI) {
    ctx.addIssue({
      code: "custom",
      path: ["MONGODB_URI"],
      message: "MONGODB_URI is required in production",
    });
  }
  if (!value.RESEND_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["RESEND_API_KEY"],
      message: "RESEND_API_KEY is required in production for email verification and password reset",
    });
  }
  if (!value.EMAIL_FROM && !value.RESEND_FROM_EMAIL) {
    ctx.addIssue({
      code: "custom",
      path: ["EMAIL_FROM"],
      message: "EMAIL_FROM or RESEND_FROM_EMAIL is required in production",
    });
  }
  if (value.ENABLE_DEV_AUTH_TOOLS === "true") {
    ctx.addIssue({
      code: "custom",
      path: ["ENABLE_DEV_AUTH_TOOLS"],
      message: "ENABLE_DEV_AUTH_TOOLS cannot be enabled in production",
    });
  }
  if (value.ENABLE_MOCK_AI === "true") {
    ctx.addIssue({
      code: "custom",
      path: ["ENABLE_MOCK_AI"],
      message: "ENABLE_MOCK_AI cannot be enabled in production",
    });
  }
});

// Render injects PORT; Gemini and Mongo come from process.env as named below.
const parsed = envSchema.safeParse(applyEnvAliases(process.env));

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");
  throw new Error(`Invalid environment configuration: ${issues}`);
}

export const env = {
  NODE_ENV: parsed.data.NODE_ENV,
  PORT: parsed.data.PORT,
  CLIENT_URL: parsed.data.CLIENT_URL,
  LOG_LEVEL: parsed.data.LOG_LEVEL,
  MONGODB_URI: parsed.data.MONGODB_URI,
  JWT_SECRET: parsed.data.JWT_SECRET,
  JWT_EXPIRES_IN: parsed.data.JWT_EXPIRES_IN,
  JWT_REFRESH_EXPIRES_IN: parsed.data.JWT_REFRESH_EXPIRES_IN,
  GOOGLE_CLIENT_ID: parsed.data.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: parsed.data.GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL: parsed.data.GOOGLE_CALLBACK_URL,
  INITIAL_ADMIN_EMAIL: parsed.data.INITIAL_ADMIN_EMAIL,
  ENABLE_DEV_AUTH_TOOLS: parsed.data.ENABLE_DEV_AUTH_TOOLS === "true",
  ENABLE_MOCK_AI: parsed.data.ENABLE_MOCK_AI === "true",
  ENCRYPTION_KEY: parsed.data.ENCRYPTION_KEY,
  GEMINI_API_KEY: parsed.data.GEMINI_API_KEY,
  RESEND_API_KEY: parsed.data.RESEND_API_KEY,
  RESEND_FROM_EMAIL: parsed.data.RESEND_FROM_EMAIL,
  EMAIL_FROM: parsed.data.EMAIL_FROM,
  SMTP_HOST: parsed.data.SMTP_HOST,
  SMTP_PORT: parsed.data.SMTP_PORT,
  SMTP_USER: parsed.data.SMTP_USER,
  SMTP_PASS: parsed.data.SMTP_PASS,
  OPENAI_API_KEY: parsed.data.OPENAI_API_KEY,
  GROQ_API_KEY: parsed.data.GROQ_API_KEY,
  GROQ_KEYS: parsed.data.GROQ_KEYS,
  CEREBRAS_API_KEY: parsed.data.CEREBRAS_API_KEY,
  CEREBRAS_KEYS: parsed.data.CEREBRAS_KEYS,
  DEEPSEEK_API_KEY: parsed.data.DEEPSEEK_API_KEY,
  DEEPSEEK_KEY: parsed.data.DEEPSEEK_KEY,
  CF_ACCOUNT_ID: parsed.data.CF_ACCOUNT_ID,
  CF_TOKEN: parsed.data.CF_TOKEN,
  OPENROUTER_API_KEY: parsed.data.OPENROUTER_API_KEY,
  REDIS_URL: parsed.data.REDIS_URL,
  SENTRY_DSN: parsed.data.SENTRY_DSN,
  STORAGE_PROVIDER: parsed.data.STORAGE_PROVIDER,
  STORAGE_DIRECTORY: parsed.data.STORAGE_DIRECTORY,
  FILE_MAX_BYTES: parsed.data.FILE_MAX_BYTES,
  STORAGE_BUCKET: parsed.data.STORAGE_BUCKET,
  STORAGE_ACCESS_KEY: parsed.data.STORAGE_ACCESS_KEY,
  STORAGE_SECRET_KEY: parsed.data.STORAGE_SECRET_KEY,
  STORAGE_REGION: parsed.data.STORAGE_REGION,
  STORAGE_PUBLIC_URL: parsed.data.STORAGE_PUBLIC_URL,
  STORAGE_ENDPOINT: parsed.data.STORAGE_ENDPOINT,
  SEARCH_PROVIDER: parsed.data.SEARCH_PROVIDER,
  SEARCH_API_KEY: parsed.data.SEARCH_API_KEY,
  IMAGE_GENERATION_PROVIDER: parsed.data.IMAGE_GENERATION_PROVIDER,
  IMAGE_GENERATION_API_KEY: parsed.data.IMAGE_GENERATION_API_KEY,
  VOICE_PROVIDER: parsed.data.VOICE_PROVIDER,
  VOICE_API_KEY: parsed.data.VOICE_API_KEY,
  ANALYSIS_RUNNER_URL: parsed.data.ANALYSIS_RUNNER_URL,
  AI_FALLBACK_PROVIDER_ID: parsed.data.AI_FALLBACK_PROVIDER_ID,
  AI_FALLBACK_MODEL_ID: parsed.data.AI_FALLBACK_MODEL_ID,
  COOKIE_DOMAIN: parsed.data.COOKIE_DOMAIN,
  RATE_LIMIT_WINDOW_MS: parsed.data.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_AUTH: parsed.data.RATE_LIMIT_AUTH,
  RATE_LIMIT_LOGIN_FAILURES: parsed.data.RATE_LIMIT_LOGIN_FAILURES,
  RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS: parsed.data.RATE_LIMIT_LOGIN_FAILURE_WINDOW_MS,
  RATE_LIMIT_CHAT: parsed.data.RATE_LIMIT_CHAT,
  RATE_LIMIT_CHAT_PLATFORM: parsed.data.RATE_LIMIT_CHAT_PLATFORM,
  RATE_LIMIT_UPLOAD: parsed.data.RATE_LIMIT_UPLOAD,
  RATE_LIMIT_SEARCH: parsed.data.RATE_LIMIT_SEARCH,
  RATE_LIMIT_IMAGE: parsed.data.RATE_LIMIT_IMAGE,
  RATE_LIMIT_VOICE: parsed.data.RATE_LIMIT_VOICE,
  RATE_LIMIT_PASSWORD_RESET: parsed.data.RATE_LIMIT_PASSWORD_RESET,
  AUTO_MODE_DAILY_TOKEN_CEILING: parsed.data.AUTO_MODE_DAILY_TOKEN_CEILING,
};

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
