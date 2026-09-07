import type { CookieOptions, Response } from "express";
import { allowedClientOrigins } from "../../config/cors.js";
import { env, isProduction } from "../../config/env.js";
import { ACCESS_COOKIE, OAUTH_STATE_COOKIE, REFRESH_COOKIE } from "./config.js";

/**
 * Access/refresh cookies are HttpOnly and never written to localStorage.
 * SameSite=Lax is used in local development so the SPA on :5173 can send
 * cookies to the API on :5000. Production uses Strict when the API and
 * client share a site. Cross-subdomain deploys set COOKIE_DOMAIN and need
 * SameSite=None; Secure so the SPA can send credentials.
 *
 * The OAuth state cookie inherits that SameSite so the Google callback
 * (a cross-site top-level GET) still receives it after accounts.google.com.
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
  const options = sessionCookieOptions();
  return {
    ...options,
    // Strict would drop the cookie when Google returns from another site.
    sameSite: options.sameSite === "strict" ? "lax" : options.sameSite,
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

/**
 * The single origin to send a browser back to after an OAuth round trip.
 *
 * CLIENT_URL is a comma-separated allowlist (apex plus www, and any preview
 * origins), so it cannot be pasted into a URL as-is: doing that produced
 * redirects to `https://ken-ai.tech,https://www.ken-ai.tech/login`, which no
 * browser can resolve. The first entry is the canonical origin, so redirects
 * use that and the rest stay purely a CORS concern.
 */
export function clientOrigin(): string {
  return allowedClientOrigins()[0] ?? env.CLIENT_URL.split(",")[0]?.trim().replace(/\/$/, "") ?? "";
}
