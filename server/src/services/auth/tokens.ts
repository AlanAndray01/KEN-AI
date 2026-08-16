import { SignJWT, jwtVerify } from "jose";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import type { UserRole } from "@aether/shared";
import { getJwtSecret } from "./config.js";

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: UserRole;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getJwtSecret());
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ role: payload.role, sid: payload.sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(env.JWT_EXPIRES_IN)
    .sign(secretKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const sub = payload.sub;
    const sid = payload.sid;
    const role = payload.role;

    if (typeof sub !== "string" || typeof sid !== "string" || (role !== "user" && role !== "admin")) {
      throw new Error("invalid payload");
    }

    return { sub, sid, role };
  } catch {
    throw new AppError("Invalid or expired session", {
      statusCode: 401,
      code: "INVALID_SESSION",
    });
  }
}
