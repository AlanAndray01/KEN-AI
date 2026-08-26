import type { CookieOptions, Response } from "express";
import { env, isProduction } from "../../config/env.js";
import { ACCESS_COOKIE, OAUTH_STATE_COOKIE, REFRESH_COOKIE } from "./config.js";

/**
 * Access/refresh cookies are HttpOnly and never written to localStorage.
 * SameSite=Lax is used in local development so the SPA on :5173 can send
 * cookies to the API on :5000. Production uses Strict when the API and
 * client share a site. Cross-subdomain deploys set COOKIE_DOMAIN and need
 * SameSite=None; Secure so the SPA can send credentials.
 *
 * The OAuth state cookie stays Lax: Google's top-level redirect back to
 * /api/auth/google/callback is cross-site and would drop a Strict cookie.
 */
export function sessionCookieOptions(): CookieOptions {
  const crossSubdomain = Boolean(env.COOKIE_DOMAIN);
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction || crossSubdomain,
    sameSite: crossSubdomain ? "none" : isProduction ? "strict" : "lax",
    path: "/",
  };
  if (env.COOKIE_DOMAIN) {
    options.domain = env.COOKIE_DOMAIN;
  }
  return options;
}

function oauthStateCookieOptions(): CookieOptions {
  return {
    ...sessionCookieOptions(),
    sameSite: "lax",
    path: "/api/auth",
  };
}

export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }): void {
  const options = sessionCookieOptions();
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...options,
    maxAge: 15 * 60 * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...options,
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  const options = sessionCookieOptions();
  res.clearCookie(ACCESS_COOKIE, { ...options });
  res.clearCookie(REFRESH_COOKIE, { ...options, path: "/api/auth" });
}

export function setOAuthStateCookie(res: Response, state: string): void {
  res.cookie(OAUTH_STATE_COOKIE, state, {
    ...oauthStateCookieOptions(),
    maxAge: 10 * 60 * 1000,
  });
}

export function clearOAuthStateCookie(res: Response): void {
  res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions());
}

export function clientOrigin(): string {
  return env.CLIENT_URL.replace(/\/$/, "");
}
