import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { isAllowedOrigin } from "../config/cors.js";
import { hasLeakedSecret } from "../utils/redact.js";

describe("HTTP hardening", () => {
  it("sets Helmet headers and allows the configured client origin", async () => {
    const response = await request(app).get("/api/health").set("Origin", "http://localhost:5173");
    expect(response.status).toBe(200);
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(hasLeakedSecret(JSON.stringify(response.body))).toBe(false);
  });

  it("rejects disallowed CORS origins", async () => {
    const response = await request(app).get("/api/health").set("Origin", "https://evil.example");
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CORS_FORBIDDEN");
  });

  it("returns 400 for invalid JSON bodies instead of 500", async () => {
    const response = await request(app).post("/api/auth/login").send({ email: "not-an-email", password: "x" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(JSON.stringify(response.body)).not.toMatch(/passwordHash|apiKey|sk-/);
  });
});

describe("isAllowedOrigin", () => {
  it("allows missing Origin and the configured client", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
  });
});
