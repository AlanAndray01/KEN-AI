import { env, isProduction, isTest } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

const DEV_FALLBACK_SECRET = "aether-dev-only-jwt-secret-change-me";

export function getJwtSecret(): string {
  if (env.JWT_SECRET) {
    return env.JWT_SECRET;
  }

  if (isProduction) {
    throw new AppError("JWT_SECRET is not configured", {
      statusCode: 500,
      code: "AUTH_NOT_CONFIGURED",
      expose: false,
    });
  }

  return isTest ? `${DEV_FALLBACK_SECRET}-test` : DEV_FALLBACK_SECRET;
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export const ACCESS_COOKIE = "aether_access";
export const REFRESH_COOKIE = "aether_refresh";
