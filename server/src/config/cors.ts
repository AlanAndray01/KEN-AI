import type { CorsOptions } from "cors";
import { env } from "./env.js";
import { AppError } from "../utils/AppError.js";

export function allowedClientOrigins(): string[] {
  return env.CLIENT_URL.split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter((value) => value.length > 0);
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  return allowedClientOrigins().includes(origin.replace(/\/$/, ""));
}

export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }
    callback(
      new AppError("Origin not allowed", {
        statusCode: 403,
        code: "CORS_FORBIDDEN",
      }),
    );
  },
  credentials: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
  exposedHeaders: ["X-Request-Id", "Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"],
  maxAge: 600,
};
