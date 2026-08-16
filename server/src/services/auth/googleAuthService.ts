import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { isGoogleOAuthConfigured } from "./config.js";

export interface GoogleProfile {
  googleId: string;
  email: string;
  name: string;
  avatar?: string;
}

function getClient(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError("Google sign-in is not configured", {
      statusCode: 503,
      code: "GOOGLE_NOT_CONFIGURED",
    });
  }

  return new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_CALLBACK_URL);
}

export function getGoogleAuthUrl(state?: string): string {
  const client = getClient();
  return client.generateAuthUrl({
    access_type: "online",
    prompt: "select_account",
    scope: ["openid", "email", "profile"],
    ...(state ? { state } : {}),
  });
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const client = getClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) {
    throw new AppError("Invalid Google sign-in response", {
      statusCode: 401,
      code: "GOOGLE_INVALID",
    });
  }

  return verifyGoogleIdToken(tokens.id_token);
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  if (!isGoogleOAuthConfigured() || !env.GOOGLE_CLIENT_ID) {
    throw new AppError("Google sign-in is not configured", {
      statusCode: 503,
      code: "GOOGLE_NOT_CONFIGURED",
    });
  }

  const client = getClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw new AppError("Invalid Google sign-in response", {
      statusCode: 401,
      code: "GOOGLE_INVALID",
    });
  }

  const profile: GoogleProfile = {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name?.trim() || payload.email.split("@")[0] || "Google user",
  };

  if (payload.picture) {
    profile.avatar = payload.picture;
  }

  return profile;
}
