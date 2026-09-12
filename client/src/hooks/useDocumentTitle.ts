import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { APP_NAME } from "@Ken/shared";

function titleForPath(pathname: string): string {
  if (pathname === "/") return APP_NAME;
  if (pathname.startsWith("/login")) return `Sign in · ${APP_NAME}`;
  if (pathname.startsWith("/register")) return `Create account · ${APP_NAME}`;
  if (pathname.startsWith("/forgot-password")) return `Forgot password · ${APP_NAME}`;
  if (pathname.startsWith("/reset-password")) return `Reset password · ${APP_NAME}`;
  if (pathname.startsWith("/verify-email")) return `Verify email · ${APP_NAME}`;
  if (pathname.startsWith("/chat")) return `Chat · ${APP_NAME}`;
  if (pathname.startsWith("/search") || pathname.startsWith("/history")) return `History · ${APP_NAME}`;
  if (pathname.startsWith("/library")) return `Library · ${APP_NAME}`;
  if (pathname.startsWith("/gpts/create")) return `Create GPT · ${APP_NAME}`;
  if (pathname.startsWith("/gpts/")) return `GPT · ${APP_NAME}`;
  if (pathname.startsWith("/gpts")) return `GPTs · ${APP_NAME}`;
  if (pathname.startsWith("/settings")) return `Settings · ${APP_NAME}`;
  if (pathname.startsWith("/admin")) return `Admin · ${APP_NAME}`;
  if (pathname.startsWith("/share")) return `Shared chat · ${APP_NAME}`;
  return APP_NAME;
}

/** Public pages worth a canonical of their own; everything else points home. */
const CANONICAL_PATHS = new Set(["/", "/login", "/register", "/privacy", "/terms"]);

/**
 * Keeps <link rel="canonical"> in step with the route.
 *
 * index.html ships a canonical of the homepage so a non-rendering crawler sees
 * one, but that tag is static: left alone it would tell Google that /privacy and
 * /terms are duplicates of the homepage and drop them from the index. Public
 * routes therefore get a self-referencing canonical, and the signed-in surfaces
 * — which robots.txt disallows anyway — fall back to the homepage rather than
 * advertising a URL that only renders behind a session.
 */
function syncCanonical(pathname: string): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) return;
  const path = CANONICAL_PATHS.has(pathname) ? pathname : "/";
  link.href = new URL(path, window.location.origin).toString();
}

export function useDocumentTitle(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
    syncCanonical(pathname);
  }, [pathname]);
}
