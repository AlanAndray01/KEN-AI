import type { CookieOptions, Response } from "express";
import { env, isProduction } from "../../config/env.js";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "./config.js";

function baseCookieOptions(): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
  };
  if (env.COOKIE_DOMAIN) {
    options.domain = env.COOKIE_DOMAIN;
  }
  return options;
}

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookieOptions(),
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookieOptions(),
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookieOptions() });
  res.clearCookie(REFRESH_COOKIE, { ...baseCookieOptions(), path: "/api/auth" });
}

export function clientOrigin(): string {
  return env.CLIENT_URL.replace(/\/$/, "");
}
