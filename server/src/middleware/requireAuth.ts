import type { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { ACCESS_COOKIE } from "../services/auth/config.js";
import { assertSessionActive, getUserById } from "../services/auth/authService.js";
import { verifyAccessToken } from "../services/auth/tokens.js";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readAccessToken(req);
    if (!token) {
      throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
    }

    const payload = await verifyAccessToken(token);
    await assertSessionActive(payload.sid);
    req.auth = {
      userId: payload.sub,
      sessionId: payload.sid,
      role: payload.role,
      user: await getUserById(payload.sub),
    };
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) {
    next(new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" }));
    return;
  }

  if (req.auth.role !== "admin") {
    next(new AppError("Administrator access required", { statusCode: 403, code: "FORBIDDEN" }));
    return;
  }

  next();
}

function readAccessToken(req: Request): string | undefined {
  const cookieToken = req.cookies?.[ACCESS_COOKIE];
  if (typeof cookieToken === "string" && cookieToken.length > 0) {
    return cookieToken;
  }

  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) {
    const bearer = header.slice("Bearer ".length).trim();
    return bearer.length > 0 ? bearer : undefined;
  }

  return undefined;
}
