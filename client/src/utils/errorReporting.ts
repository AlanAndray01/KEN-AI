/**
 * VITE_SENTRY_DSN is inlined at build time, so when it's unset the `if`
 * below is dead code Vite/Rollup removes along with the dynamic import —
 * a build with no DSN configured ships zero Sentry code, not an inert copy
 * of it. Mirrors the server's config/sentry.ts: a no-op until configured.
 */
const dsn = import.meta.env.VITE_SENTRY_DSN;

let sentry: typeof import("@sentry/react") | undefined;

if (dsn) {
  void import("@sentry/react").then((mod) => {
    mod.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0 });
    sentry = mod;
  });
}

export function reportError(error: unknown, context?: Record<string, unknown>): void {
  sentry?.captureException(error, context ? { extra: context } : undefined);
}
