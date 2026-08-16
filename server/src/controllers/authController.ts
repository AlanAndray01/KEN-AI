import type { Request, Response } from "express";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@aether/shared";
import { AppError } from "../utils/AppError.js";
import { REFRESH_COOKIE, isGoogleOAuthConfigured } from "../services/auth/config.js";
import { clearAuthCookies, clientOrigin, setAuthCookies } from "../services/auth/cookies.js";
import {
  changePassword,
  forgotPassword,
  loginUser,
  loginWithGoogleProfile,
  logoutUser,
  refreshAuth,
  registerUser,
  resetPassword,
} from "../services/auth/authService.js";
import { exchangeGoogleCode, getGoogleAuthUrl, verifyGoogleIdToken } from "../services/auth/googleAuthService.js";

function sendUser(
  res: Response,
  status: number,
  result: { user: unknown; accessToken: string; refreshToken: string },
): void {
  setAuthCookies(res, result);
  res.status(status).json({ user: result.user });
}

export async function register(req: Request, res: Response): Promise<void> {
  const body = registerSchema.parse(req.body);
  sendUser(res, 201, await registerUser(body, req));
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = loginSchema.parse(req.body);
  sendUser(res, 200, await loginUser(body, req));
}

export async function logout(req: Request, res: Response): Promise<void> {
  const refreshToken = typeof req.cookies?.[REFRESH_COOKIE] === "string" ? req.cookies[REFRESH_COOKIE] : undefined;
  await logoutUser(req.auth?.sessionId, refreshToken);
  clearAuthCookies(res);
  res.status(200).json({ ok: true });
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  res.status(200).json({ user: req.auth.user });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const refreshToken = typeof req.cookies?.[REFRESH_COOKIE] === "string" ? req.cookies[REFRESH_COOKIE] : undefined;
  if (!refreshToken) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  sendUser(res, 200, await refreshAuth(refreshToken, req));
}

export async function changePasswordHandler(req: Request, res: Response): Promise<void> {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }

  const body = changePasswordSchema.parse(req.body);
  await changePassword(req.auth.userId, body);
  clearAuthCookies(res);
  res.status(200).json({ ok: true });
}

export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  const body = forgotPasswordSchema.parse(req.body);
  const resetToken = await forgotPassword(body.email);
  const payload: { ok: true; resetToken?: string } = { ok: true };
  if (resetToken) {
    payload.resetToken = resetToken;
  }
  res.status(200).json(payload);
}

export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const body = resetPasswordSchema.parse(req.body);
  await resetPassword(body.token, body.password);
  clearAuthCookies(res);
  res.status(200).json({ ok: true });
}

export async function googleStart(_req: Request, res: Response): Promise<void> {
  if (!isGoogleOAuthConfigured()) {
    res.redirect(`${clientOrigin()}/login?error=google_not_configured`);
    return;
  }

  res.redirect(getGoogleAuthUrl());
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const error = typeof req.query.error === "string" ? req.query.error : undefined;
  if (error === "access_denied") {
    res.redirect(`${clientOrigin()}/login?error=google_cancelled`);
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  if (!code) {
    res.redirect(`${clientOrigin()}/login?error=google_invalid`);
    return;
  }

  try {
    const profile = await exchangeGoogleCode(code);
    const result = await loginWithGoogleProfile(profile, req);
    setAuthCookies(res, result);
    res.redirect(`${clientOrigin()}/chat`);
  } catch {
    res.redirect(`${clientOrigin()}/login?error=google_invalid`);
  }
}

export async function googleToken(req: Request, res: Response): Promise<void> {
  if (!isGoogleOAuthConfigured()) {
    throw new AppError("Google sign-in is not configured", {
      statusCode: 503,
      code: "GOOGLE_NOT_CONFIGURED",
    });
  }

  const body = googleAuthSchema.parse(req.body);
  const profile = await verifyGoogleIdToken(body.idToken);
  sendUser(res, 200, await loginWithGoogleProfile(profile, req));
}
