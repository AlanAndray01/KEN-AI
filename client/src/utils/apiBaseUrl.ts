export interface ApiBaseUrlEnv {
  DEV?: boolean;
  PROD?: boolean;
  VITE_API_BASE_URL?: string;
  VITE_API_URL?: string;
}

/** Hosts that serve the SPA and proxy `/api/auth/*` to Render via vercel.json. */
const SAME_ORIGIN_AUTH_HOSTS = new Set(["ken-ai.tech", "www.ken-ai.tech"]);

/**
 * Public API prefix only. Never bake a provider key into VITE_*.
 * Production must set VITE_API_BASE_URL (or VITE_API_URL) so the SPA does not
 * call localhost after a Vercel deploy.
 */
export function resolveApiBaseUrl(env: ApiBaseUrlEnv): string {
  const configured = env.VITE_API_BASE_URL?.trim() || env.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (env.DEV && !env.PROD) return "http://localhost:5000/api";
  throw new Error(
    "VITE_API_BASE_URL (or VITE_API_URL) must be set for a production build. Example: https://api.ken-ai.tech/api",
  );
}

/**
 * Session routes (login, Google start, refresh, /me) go same-origin on the
 * live client so Set-Cookie is first-party. Chat and other APIs stay on the
 * Render host so Vercel does not buffer SSE.
 */
export function resolveAuthBaseUrl(
  env: ApiBaseUrlEnv,
  hostname = typeof window === "undefined" ? "" : window.location.hostname,
): string {
  if (SAME_ORIGIN_AUTH_HOSTS.has(hostname)) return "/api";
  return resolveApiBaseUrl(env);
}
