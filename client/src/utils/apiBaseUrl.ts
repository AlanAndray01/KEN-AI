export interface ApiBaseUrlEnv {
  DEV?: boolean;
  PROD?: boolean;
  VITE_API_BASE_URL?: string;
  VITE_API_URL?: string;
}

/**
 * Public API prefix only. Never bake a provider key into VITE_*.
 * Production must set VITE_API_BASE_URL (or VITE_API_URL) so the SPA does not
 * call localhost after a Vercel deploy.
 *
 * Auth uses this same host. Vercel only serves the static SPA (`vercel.json`
 * rewrites unmatched paths to index.html), so same-origin `/api/auth/*` on
 * ken-ai.tech is not an API — POST login becomes 405 + index.html.
 */
export function resolveApiBaseUrl(env: ApiBaseUrlEnv): string {
  const configured = env.VITE_API_BASE_URL?.trim() || env.VITE_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (env.DEV && !env.PROD) return "http://localhost:5000/api";
  throw new Error(
    "VITE_API_BASE_URL (or VITE_API_URL) must be set for a production build. Example: https://api.ken-ai.tech/api",
  );
}
