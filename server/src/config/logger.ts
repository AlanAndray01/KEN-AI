import pino from "pino";
import { env, isProduction } from "./env.js";

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "api_key",
  "*.apiKey",
  "*.api_key",
  "encryptedApiKey",
  "GEMINI_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "SEARCH_API_KEY",
  "IMAGE_GENERATION_API_KEY",
  "VOICE_API_KEY",
  "ENCRYPTION_KEY",
  "JWT_SECRET",
  "GOOGLE_CLIENT_SECRET",
  "uri",
  "MONGODB_URI",
  "req.body.password",
  "req.body.currentPassword",
  "req.body.newPassword",
  "req.body.apiKey",
];

const prettyLogs = !isProduction && env.NODE_ENV !== "test";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: redactPaths,
    censor: "[Redacted]",
  },
  ...(prettyLogs
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});
