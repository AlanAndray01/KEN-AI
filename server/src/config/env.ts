import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

dotenv.config({ path: path.join(serverDir, ".env") });

const emptyToUndefined = (value: unknown): unknown =>
  value === "" || value === undefined ? undefined : value;

const envSchema = z.object({
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
  OPENAI_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  ANTHROPIC_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  GROQ_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  OPENROUTER_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  STORAGE_PROVIDER: z.enum(["local", "s3", "r2", "cloudinary"]).default("local"),
  STORAGE_DIRECTORY: z.string().min(1).default("uploads"),
  FILE_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
  SEARCH_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["tavily", "brave", "serper"]).optional()),
  SEARCH_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  IMAGE_GENERATION_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["openai"]).optional()),
  IMAGE_GENERATION_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  VOICE_PROVIDER: z.preprocess(emptyToUndefined, z.enum(["openai"]).optional()),
  VOICE_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  ANALYSIS_RUNNER_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  AI_FALLBACK_PROVIDER_ID: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(64).optional()),
  AI_FALLBACK_MODEL_ID: z.preprocess(emptyToUndefined, z.string().trim().min(1).max(160).optional()),
  COOKIE_DOMAIN: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_AUTH: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_CHAT: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_UPLOAD: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_SEARCH: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_IMAGE: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_VOICE: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PASSWORD_RESET: z.coerce.number().int().positive().default(5),
});

const parsed = envSchema.safeParse(process.env);

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
  OPENAI_API_KEY: parsed.data.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: parsed.data.ANTHROPIC_API_KEY,
  GROQ_API_KEY: parsed.data.GROQ_API_KEY,
  OPENROUTER_API_KEY: parsed.data.OPENROUTER_API_KEY,
  STORAGE_PROVIDER: parsed.data.STORAGE_PROVIDER,
  STORAGE_DIRECTORY: parsed.data.STORAGE_DIRECTORY,
  FILE_MAX_BYTES: parsed.data.FILE_MAX_BYTES,
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
  RATE_LIMIT_CHAT: parsed.data.RATE_LIMIT_CHAT,
  RATE_LIMIT_UPLOAD: parsed.data.RATE_LIMIT_UPLOAD,
  RATE_LIMIT_SEARCH: parsed.data.RATE_LIMIT_SEARCH,
  RATE_LIMIT_IMAGE: parsed.data.RATE_LIMIT_IMAGE,
  RATE_LIMIT_VOICE: parsed.data.RATE_LIMIT_VOICE,
  RATE_LIMIT_PASSWORD_RESET: parsed.data.RATE_LIMIT_PASSWORD_RESET,
};

export const isProduction = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
