import type { Request, Response } from "express";
import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleAuthSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "@Ken/shared";
import { AppError } from "../utils/AppError.js";
import { OAUTH_STATE_COOKIE, REFRESH_COOKIE, isGoogleOAuthConfigured } from "../services/auth/config.js";
import {
  clearAuthCookies,
  clearOAuthStateCookie,
  clientOrigin,
  setAuthCookies,
  setOAuthStateCookie,
} from "../services/auth/cookies.js";
import {
  changePassword,
  forgotPassword,
  loginUser,
  loginWithGoogleProfile,
  logoutUser,
  refreshAuth,
  registerUser,
  resendVerificationCode,
  resetPassword,
  verifyEmailCode,
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
  res.status(201).json(await registerUser(body));
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = loginSchema.parse(req.body);
  sendUser(res, 200, await loginUser(body, req));
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const body = verifyEmailSchema.parse(req.body);
  sendUser(res, 200, await verifyEmailCode(body, req));
}

export async function resendCode(req: Request, res: Response): Promise<void> {
  const body = resendVerificationSchema.parse(req.body);
  res.status(200).json(await resendVerificationCode(body.email));
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
  await resetPassword({
    email: body.email,
    password: body.password,
    ...(body.token ? { token: body.token } : {}),
    ...(body.code ? { code: body.code } : {}),
  });
  clearAuthCookies(res);
  res.status(200).json({ ok: true });
}

export async function googleStart(_req: Request, res: Response): Promise<void> {
  if (!isGoogleOAuthConfigured()) {
    res.redirect(`${clientOrigin()}/login?error=google_not_configured`);
    return;
  }

  // Bind this authorization request to the browser that started it, so a
  // callback forged by another site cannot sign the victim into an account.
  const state = randomBytes(32).toString("base64url");
  setOAuthStateCookie(res, state);
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.redirect(302, getGoogleAuthUrl(state));
}

function statesMatch(received: unknown, expected: unknown): boolean {
  if (typeof received !== "string" || typeof expected !== "string") return false;
  if (received.length === 0 || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

export async function googleCallback(req: Request, res: Response): Promise<void> {
  const expectedState = req.cookies?.[OAUTH_STATE_COOKIE] as unknown;
  clearOAuthStateCookie(res);

  const error = typeof req.query.error === "string" ? req.query.error : undefined;
  if (error === "access_denied") {
    res.redirect(`${clientOrigin()}/login?error=google_cancelled`);
    return;
  }

  if (!statesMatch(req.query.state, expectedState)) {
    res.redirect(`${clientOrigin()}/login?error=google_state`);
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
