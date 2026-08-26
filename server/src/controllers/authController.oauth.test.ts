import request from "supertest";
import { describe, expect, it, vi } from "vitest";

vi.mock("../services/auth/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/auth/config.js")>();
  return { ...actual, isGoogleOAuthConfigured: () => true };
});

vi.mock("../services/auth/googleAuthService.js", () => ({
  getGoogleAuthUrl: (state?: string) =>
    `https://accounts.google.com/o/oauth2/v2/auth?client_id=test&state=${state ?? ""}`,
  exchangeGoogleCode: vi.fn(async () => ({
    googleId: "google-1",
    email: "ada@example.com",
    name: "Ada",
  })),
  verifyGoogleIdToken: vi.fn(),
}));

vi.mock("../services/auth/authService.js", () => ({
  registerUser: vi.fn(),
  loginUser: vi.fn(),
  logoutUser: vi.fn(),
  refreshAuth: vi.fn(),
  changePassword: vi.fn(),
  forgotPassword: vi.fn(),
  resetPassword: vi.fn(),
  loginWithGoogleProfile: vi.fn(async () => ({
    user: { id: "u1", email: "ada@example.com" },
    accessToken: "access-token",
    refreshToken: "refresh-token",
  })),
  verifyEmailCode: vi.fn(),
  resendVerificationCode: vi.fn(),
}));

const { app } = await import("../app.js");

function stateFromLocation(location: string): string {
  return new URL(location).searchParams.get("state") ?? "";
}

function stateCookie(response: { headers: Record<string, unknown> }): string | undefined {
  const raw = response.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw.map(String) : [];
  return cookies.find((cookie) => cookie.startsWith("aether_oauth_state="));
}

describe("Google OAuth CSRF state", () => {
  it("issues a random state and stores it in an httpOnly cookie", async () => {
    const response = await request(app).get("/api/auth/google");

    expect(response.status).toBe(302);
    const state = stateFromLocation(String(response.headers.location));
    expect(state.length).toBeGreaterThan(20);

    const cookie = stateCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie).toContain(state);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Path=/api/auth");
  });

  it("issues a different state on every attempt", async () => {
    const first = await request(app).get("/api/auth/google");
    const second = await request(app).get("/api/auth/google");

    expect(stateFromLocation(String(first.headers.location))).not.toBe(
      stateFromLocation(String(second.headers.location)),
    );
  });

  it("completes sign-in when the state matches the cookie", async () => {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/google");
    const state = stateFromLocation(String(start.headers.location));

    const callback = await agent.get("/api/auth/google/callback").query({ code: "valid-code", state });

    expect(callback.status).toBe(302);
    expect(String(callback.headers.location)).toContain("/chat");
  });

  it("rejects a callback with no state at all", async () => {
    const response = await request(app).get("/api/auth/google/callback").query({ code: "valid-code" });

    expect(String(response.headers.location)).toContain("error=google_state");
  });

  it("rejects a forged state that does not match the cookie", async () => {
    const agent = request.agent(app);
    await agent.get("/api/auth/google");

    const response = await agent
      .get("/api/auth/google/callback")
      .query({ code: "valid-code", state: "attacker-supplied-state" });

    expect(String(response.headers.location)).toContain("error=google_state");
  });

  it("rejects a callback that carries a state but no cookie", async () => {
    const start = await request(app).get("/api/auth/google");
    const state = stateFromLocation(String(start.headers.location));

    const response = await request(app).get("/api/auth/google/callback").query({ code: "valid-code", state });

    expect(String(response.headers.location)).toContain("error=google_state");
  });

  it("clears the state cookie so it cannot be replayed", async () => {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/google");
    const state = stateFromLocation(String(start.headers.location));

    await agent.get("/api/auth/google/callback").query({ code: "valid-code", state });

    const replay = await agent.get("/api/auth/google/callback").query({ code: "valid-code", state });
    expect(String(replay.headers.location)).toContain("error=google_state");
  });

  it("still reports a cancelled sign-in", async () => {
    const response = await request(app).get("/api/auth/google/callback").query({ error: "access_denied" });

    expect(String(response.headers.location)).toContain("error=google_cancelled");
  });

  it("requires an authorization code even when the state is valid", async () => {
    const agent = request.agent(app);
    const start = await agent.get("/api/auth/google");
    const state = stateFromLocation(String(start.headers.location));

    const response = await agent.get("/api/auth/google/callback").query({ state });

    expect(String(response.headers.location)).toContain("error=google_invalid");
  });
});
