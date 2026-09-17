import { env } from "./env.js";

/**
 * @sentry/node's import cost alone — before init() is ever called — is heavy
 * enough (OpenTelemetry instrumentation, various submodules) to noticeably
 * slow down every cold import of app.js. As a static top-level import this
 * showed up as previously-reliable "requires auth" route tests intermittently
 * timing out at vitest's 5s default, since each of those re-imports app.js
 * fresh. Loading the SDK only when SENTRY_DSN is actually set keeps that cost
 * out of every dev/test/import that doesn't need it — the same deferred-load
 * approach client/src/utils/errorReporting.ts uses for @sentry/react.
 */
let sentry: typeof import("@sentry/node") | undefined;

if (env.SENTRY_DSN) {
  void import("@sentry/node").then((mod) => {
    mod.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV,
      // Error tracking, not performance tracing — keep this cheap and simple.
      tracesSampleRate: 0,
    });
    sentry = mod;
  });
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  sentry?.captureException(error, context ? { extra: context } : undefined);
}
