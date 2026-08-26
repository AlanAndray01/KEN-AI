import request from "supertest";
import type { Express } from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearDatabase,
  cookiesFrom,
  explainSkip,
  loadApp,
  mergeCookies,
  stopInMemoryMongo,
  tryStartInMemoryMongo,
} from "../test/mongoHarness.js";
import { registerVerified } from "../test/registerVerified.js";
import { User } from "../models/User.js";

const mongo = await tryStartInMemoryMongo();
explainSkip(mongo, "auth routes (real MongoDB)");

let app: Express;

const credentials = { name: "Ada Lovelace", email: "ada@example.com", password: "Correct-horse-battery1!" };

describe.skipIf(!mongo.ok)("auth routes (real MongoDB)", () => {
  beforeAll(async () => {
    app = await loadApp();
  });

  afterAll(async () => {
    await stopInMemoryMongo();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it("registers a user, requires email verification, then sets both auth cookies", async () => {
    const registered = await request(app).post("/api/auth/register").send(credentials);

    expect(registered.status).toBe(201);
    expect(registered.body.requiresVerification).toBe(true);
    expect(registered.body.email).toBe("ada@example.com");
    expect(registered.body.user).toBeUndefined();
    expect(JSON.stringify(registered.body)).not.toContain(credentials.password);
    expect(registered.headers["set-cookie"]).toBeUndefined();

    const stored = await User.findOne({ email: "ada@example.com" }).lean();
    expect(stored?.["isVerified"]).toBe(false);

    const verified = await request(app).post("/api/auth/verify-email").send({
      email: credentials.email,
      code: registered.body.verificationCode,
    });
    expect(verified.status).toBe(200);
    expect(verified.body.user).not.toHaveProperty("passwordHash");

    const cookies = cookiesFrom(verified).join(";");
    expect(cookies).toContain("aether_access=");
    expect(cookies).toContain("aether_refresh=");
    expect((await User.findOne({ email: "ada@example.com" }).lean())?.["isVerified"]).toBe(true);
  });

  it("stores the password as a hash, never in plaintext", async () => {
    await request(app).post("/api/auth/register").send(credentials);

    // passwordHash is select:false, so it must be requested explicitly.
    const stored = await User.findOne({ email: "ada@example.com" }).select("+passwordHash").lean();

    expect(stored).not.toBeNull();
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain(credentials.password);
    expect(stored?.["passwordHash"]).toMatch(/^\$argon2/);
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/api/auth/register").send(credentials);
    const duplicate = await request(app).post("/api/auth/register").send(credentials);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_TAKEN");
    expect(await User.countDocuments({ email: "ada@example.com" })).toBe(1);
  });

  it("signs in with valid credentials only after verification, and rejects a wrong password", async () => {
    await request(app).post("/api/auth/register").send(credentials);

    const unverified = await request(app)
      .post("/api/auth/login")
      .send({ email: credentials.email, password: credentials.password });
    expect(unverified.status).toBe(403);
    expect(unverified.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(unverified.body.requiresVerification).toBe(true);

    await request(app).post("/api/auth/verify-email").send({
      email: credentials.email,
      code: unverified.body.verificationCode,
    });

    const ok = await request(app)
      .post("/api/auth/login")
      .send({ email: credentials.email, password: credentials.password });
    expect(ok.status).toBe(200);

    const bad = await request(app)
      .post("/api/auth/login")
      .send({ email: credentials.email, password: "wrong-password" });
    expect(bad.status).toBe(401);
    expect(JSON.stringify(bad.body)).not.toContain("passwordHash");
  });

  it("returns the current user only with a valid session", async () => {
    const { cookies } = await registerVerified(app, credentials);

    const authed = await request(app).get("/api/auth/me").set("Cookie", cookies);
    expect(authed.status).toBe(200);
    expect(authed.body.user.email).toBe("ada@example.com");

    const anonymous = await request(app).get("/api/auth/me");
    expect(anonymous.status).toBe(401);
  });

  it("issues a working session from the refresh cookie", async () => {
    const { cookies: jar } = await registerVerified(app, credentials);

    const refreshed = await request(app).post("/api/auth/refresh").set("Cookie", jar);
    expect(refreshed.status).toBe(200);

    const rotated = mergeCookies(jar, cookiesFrom(refreshed));
    const me = await request(app).get("/api/auth/me").set("Cookie", rotated);
    expect(me.status).toBe(200);
  });

  it("rejects a refresh with no cookie", async () => {
    const response = await request(app).post("/api/auth/refresh");
    expect(response.status).toBe(401);
  });

  it("ends the session on logout", async () => {
    const { cookies: jar } = await registerVerified(app, credentials);

    expect((await request(app).post("/api/auth/logout").set("Cookie", jar)).status).toBe(200);

    const reused = await request(app).post("/api/auth/refresh").set("Cookie", jar);
    expect(reused.status).toBe(401);
  });

  it("rejects a forged access cookie", async () => {
    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ["aether_access=not.a.real.token"]);

    expect(response.status).toBe(401);
  });

  it("validates the registration payload", async () => {
    const response = await request(app)
      .post("/api/auth/register")
      .send({ name: "A", email: "not-an-email", password: "short" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(await User.countDocuments({})).toBe(0);
  });
});
