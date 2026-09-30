import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { APP_NAME } from "@Ken/shared";

const SETTINGS_TITLES: Record<string, string> = {
  account: "Account",
  general: "General",
  appearance: "Appearance",
  personalization: "Personalization",
  memory: "Memory",
  voice: "Voice",
  notifications: "Notifications",
  "data-controls": "Data controls",
  models: "API keys & models",
};

const ADMIN_TITLES: Record<string, string> = {
  providers: "Providers",
  models: "Models",
  usage: "Usage",
};

function pageTitle(pathname: string): string | undefined {
  const [first = "", second] = pathname.split("/").filter(Boolean);
  switch (first) {
    case "":
      return undefined;
    case "privacy":
      return "Privacy policy";
    case "terms":
      return "Terms of service";
    case "login":
      return "Sign in";
    case "register":
      return "Create account";
    case "forgot-password":
      return "Forgot password";
    case "reset-password":
      return "Reset password";
    case "verify-email":
      return "Verify email";
    case "chat":
      return "Chat";
    case "search":
    case "history":
      return "History";
    case "library":
      return "Library";
    case "gpts":
      return second === "create" ? "Create GPT" : second ? "GPT" : "GPTs";
    case "settings":
      return second ? `${SETTINGS_TITLES[second] ?? "Page not found"} · Settings` : "Settings";
    case "admin":
      return second ? `${ADMIN_TITLES[second] ?? "Page not found"} · Admin` : "Admin";
    case "share":
      return "Shared chat";
    default:
      return "Page not found";
  }
}

export function titleForPath(pathname: string): string {
  const page = pageTitle(pathname);
  return page ? `${page} · ${APP_NAME}` : APP_NAME;
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

/**
 * index.html ships a static `index, follow` robots tag so non-JS crawlers see
 * something before robots.txt is even fetched. robots.txt then disallows the
 * signed-in surfaces, but that only stops well-behaved crawlers from
 * *requesting* those routes — a crawler that ignores it, or a URL reached via
 * an external link, would still see a page telling it to index. Once React is
 * running we know the real route, so private surfaces get an explicit
 * `noindex, nofollow` here as a second layer; public routes get the static
 * `index, follow` restored in case a client-side route change left it set to
 * `noindex` from a previous page.
 */
function syncRobots(pathname: string): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!meta) return;
  meta.content = CANONICAL_PATHS.has(pathname)
    ? "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1"
    : "noindex, nofollow";
}

export function useDocumentTitle(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
    syncCanonical(pathname);
    syncRobots(pathname);
  }, [pathname]);
}
