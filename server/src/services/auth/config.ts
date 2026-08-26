import { env, isProduction } from "../../config/env.js";
import { localDevSecret } from "../../config/devSecrets.js";
import { AppError } from "../../utils/AppError.js";

export function getJwtSecret(): string {
  if (env.JWT_SECRET) {
    return env.JWT_SECRET;
  }

  // Defence in depth: env validation already refuses to boot production
  // without JWT_SECRET, so this can only trigger if that guard is bypassed.
  if (isProduction) {
    throw new AppError("JWT_SECRET is not configured", {
      statusCode: 500,
      code: "AUTH_NOT_CONFIGURED",
      expose: false,
    });
  }

  return localDevSecret("jwt");
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

export const ACCESS_COOKIE = "Ken_access";
export const REFRESH_COOKIE = "Ken_refresh";
export const OAUTH_STATE_COOKIE = "Ken_oauth_state";
