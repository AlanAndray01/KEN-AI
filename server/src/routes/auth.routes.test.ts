import { describe, expect, it } from "vitest";
import type { RequestHandler } from "express";
import { authRouter } from "./auth.js";
import { rateLimitAuth, rateLimitPasswordReset } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/requireAuth.js";

/**
 * These are wiring tests, not behaviour tests, and that is deliberate.
 *
 * `createRateLimit` short-circuits under `NODE_ENV=test` unless a limiter opts
 * in with `enabledInTest`, so a functional test cannot observe whether a limiter
 * is attached to a route — deleting `rateLimitAuth` from a handler chain would
 * fail nothing. Asserting on the router's handler stack by reference identity
 * closes that gap: the invariant is checked structurally, so it holds regardless
 * of the test-environment bypass.
 */

/**
 * Express does not publish types for its router internals. This is the minimal
 * shape relied on here (verified against express 4.x), isolated to this file so
 * no other module needs to reach into untyped vendor internals.
 */
interface RouteLayer {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: RequestHandler }>;
  };
}

const layers = (authRouter as unknown as { stack: RouteLayer[] }).stack;

interface RouteExpectation {
  method: "get" | "post";
  path: string;
  /** Middleware that must be present in the handler chain, by reference. */
  requires: RequestHandler[];
}

/**
 * Every route the auth router registers, and the protection each one must carry.
 * A new auth route has to be added here, which is what forces the decision about
 * its rate limiting to be made consciously rather than by omission.
 */
const EXPECTED_ROUTES: RouteExpectation[] = [
  { method: "post", path: "/register", requires: [rateLimitAuth] },
  { method: "post", path: "/login", requires: [rateLimitAuth] },
  { method: "post", path: "/verify-email", requires: [rateLimitPasswordReset] },
  { method: "post", path: "/resend-code", requires: [rateLimitPasswordReset] },
  { method: "post", path: "/logout", requires: [rateLimitAuth] },
  // Authenticated read of the current user: gated by requireAuth, no limiter.
  { method: "get", path: "/me", requires: [requireAuth] },
  { method: "post", path: "/refresh", requires: [rateLimitAuth] },
  { method: "post", path: "/forgot-password", requires: [rateLimitPasswordReset] },
  { method: "post", path: "/reset-password", requires: [rateLimitPasswordReset] },
  {
    method: "post",
    path: "/change-password",
    requires: [requireAuth, rateLimitPasswordReset],
  },
  { method: "get", path: "/google", requires: [rateLimitAuth] },
  { method: "get", path: "/google/callback", requires: [rateLimitAuth] },
  { method: "post", path: "/google", requires: [rateLimitAuth] },
];

function handlersFor(method: string, path: string): RequestHandler[] {
  const layer = layers.find(
    (candidate) => candidate.route?.path === path && candidate.route.methods[method] === true,
  );
  if (!layer?.route) {
    throw new Error(`Route ${method.toUpperCase()} ${path} is not registered on authRouter`);
  }
  return layer.route.stack.map((entry) => entry.handle);
}

function routeKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

describe("authRouter wiring", () => {
  it.each(EXPECTED_ROUTES)(
    "$method $path keeps its required middleware attached",
    ({ method, path, requires }) => {
      const handlers = handlersFor(method, path);
      for (const middleware of requires) {
        expect(handlers).toContain(middleware);
      }
    },
  );

  it("rate limits every unauthenticated auth route", () => {
    const unlimited = EXPECTED_ROUTES.filter((route) => {
      const handlers = handlersFor(route.method, route.path);
      const hasLimiter =
        handlers.includes(rateLimitAuth) || handlers.includes(rateLimitPasswordReset);
      const isAuthenticated = handlers.includes(requireAuth);
      return !hasLimiter && !isAuthenticated;
    });

    expect(unlimited.map((route) => routeKey(route.method, route.path))).toEqual([]);
  });

  it("declares an expectation for every registered route", () => {
    const registered = layers
      .filter((layer): layer is Required<RouteLayer> => layer.route !== undefined)
      .flatMap((layer) =>
        Object.keys(layer.route.methods).map((method) => routeKey(method, layer.route.path)),
      )
      .sort();

    const declared = EXPECTED_ROUTES.map((route) => routeKey(route.method, route.path)).sort();

    // A new auth route must be declared above so its protection is reviewed.
    expect(registered).toEqual(declared);
  });
});
