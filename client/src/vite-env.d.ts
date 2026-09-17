/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Alias accepted on Vercel when the host already uses this name. */
  readonly VITE_API_URL?: string;
  /** "true" shows the landing page at "/", "false" redirects. Defaults to the build mode. */
  readonly VITE_SHOW_LANDING_PAGE?: string;
  /** Unset means no error tracking, not a broken one. */
  readonly VITE_SENTRY_DSN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
