import { Types } from "mongoose";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

type UserDoc = {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  avatar?: string;
  role: "user" | "admin";
  isVerified: boolean;
  preferences: { theme: "system"; language: "en"; sendOnEnter: true };
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
};

type SessionDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
};

type ResetDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  save: () => Promise<ResetDoc>;
};

type VerificationDoc = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  codeHash: string;
  expiresAt: Date;
};

const users = new Map<string, UserDoc>();
const sessions = new Map<string, SessionDoc>();
const resets = new Map<string, ResetDoc>();
const verificationTokens = new Map<string, VerificationDoc>();

function withSave<T extends { _id: Types.ObjectId }>(doc: T): T & { save: () => Promise<T> } {
  const savable = doc as T & { save: () => Promise<T> };
  savable.save = async () => savable;
  return savable;
}

function thenable<T>(value: T) {
  const promise = Promise.resolve(value);
  return {
    select: () => promise,
    then: promise.then.bind(promise),
  };
}

vi.mock("../models/User.js", () => ({
  User: {
    create: vi.fn(async (input: Partial<UserDoc> & { email: string; name: string }) => {
      for (const user of users.values()) {
        if (user.email === input.email) {
          const error = Object.assign(new Error("duplicate"), { code: 11000 });
          throw error;
        }
      }
      const created: UserDoc = {
        _id: new Types.ObjectId(),
        name: input.name,
        email: input.email,
        role: input.role ?? "user",
        isVerified: input.isVerified ?? true,
        preferences: { theme: "system", language: "en", sendOnEnter: true },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(input.passwordHash ? { passwordHash: input.passwordHash } : {}),
      };
      users.set(String(created._id), created);
      return withSave(created);
    }),
    findOne: vi.fn((query: { email?: string; googleId?: string }) => {
      const found = [...users.values()].find((user) => {
        if (query.email) return user.email === query.email;
        if (query.googleId) return user.googleId === query.googleId;
        return false;
      });
      return thenable(found ? withSave(found) : null);
    }),
    findById: vi.fn((id: string) => {
      const found = users.get(String(id));
      return thenable(found ? withSave(found) : null);
    }),
    findByIdAndUpdate: vi.fn(async (id: string, update: { lastLoginAt?: Date }) => {
      const user = users.get(String(id));
      if (!user) return null;
      if (update.lastLoginAt) user.lastLoginAt = update.lastLoginAt;
      return withSave(user);
    }),
  },
}));

vi.mock("../models/Session.js", () => ({
  Session: {
    create: vi.fn(async (input: Omit<SessionDoc, "_id">) => {
      const created: SessionDoc = { _id: new Types.ObjectId(), ...input };
      sessions.set(String(created._id), created);
      return created;
    }),
    findOne: vi.fn(
      async (query: { refreshTokenHash?: string; _id?: string; revokedAt?: object; expiresAt?: object }) => {
        return (
          [...sessions.values()].find((session) => {
            if (session.revokedAt) return false;
            if (query.refreshTokenHash) return session.refreshTokenHash === query.refreshTokenHash;
            if (query._id) return String(session._id) === String(query._id);
            return false;
          }) ?? null
        );
      },
    ),
    updateOne: vi.fn(async (query: { _id: string }, update: { $set: { revokedAt: Date } }) => {
      const session = sessions.get(String(query._id));
      if (session) session.revokedAt = update.$set.revokedAt;
    }),
    updateMany: vi.fn(async (query: { userId: string }, update: { $set: { revokedAt: Date } }) => {
      for (const session of sessions.values()) {
        if (String(session.userId) === String(query.userId) && !session.revokedAt) {
          session.revokedAt = update.$set.revokedAt;
        }
      }
    }),
  },
}));

vi.mock("../models/VerificationToken.js", () => ({
  VerificationToken: {
    create: vi.fn(async (input: Omit<VerificationDoc, "_id">) => {
      const created: VerificationDoc = { _id: new Types.ObjectId(), ...input };
      verificationTokens.set(String(created._id), created);
      return created;
    }),
    findOne: vi.fn((query: { userId?: Types.ObjectId; expiresAt?: { $gt: Date } }) => {
      const found = [...verificationTokens.values()].find((token) => {
        if (query.userId && String(token.userId) !== String(query.userId)) return false;
        if (query.expiresAt?.$gt && token.expiresAt <= query.expiresAt.$gt) return false;
        return true;
      });
      return thenable(found ?? null);
    }),
    deleteMany: vi.fn(async (query: { userId: Types.ObjectId | string }) => {
      for (const [id, token] of verificationTokens) {
        if (String(token.userId) === String(query.userId)) {
          verificationTokens.delete(id);
        }
      }
    }),
  },
}));

vi.mock("../models/PasswordReset.js", () => ({
  PasswordReset: {
    create: vi.fn(async (input: Omit<ResetDoc, "_id" | "save">) => {
      const created: ResetDoc = {
        _id: new Types.ObjectId(),
        ...input,
        save: async () => created,
      };
      resets.set(created.tokenHash, created);
      return created;
    }),
    deleteMany: vi.fn(async (query: { userId: Types.ObjectId | string }) => {
      for (const [hash, reset] of resets) {
        if (String(reset.userId) === String(query.userId) && !reset.usedAt) {
          resets.delete(hash);
        }
      }
    }),
    findOne: vi.fn((query: { tokenHash: string; userId?: Types.ObjectId | string }) => {
      const found = [...resets.values()].find((reset) => {
        if (reset.tokenHash !== query.tokenHash) return false;
        if (query.userId && String(reset.userId) !== String(query.userId)) return false;
        return true;
      });
      if (!found || found.usedAt || found.expiresAt <= new Date()) {
        return thenable(null);
      }
      return thenable(found);
    }),
  },
}));

vi.mock("../services/auth/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/auth/config.js")>();
  return { ...actual, isGoogleOAuthConfigured: () => false };
});

const { app } = await import("../app.js");
const { hasLeakedSecret } = await import("../utils/redact.js");

const password = "Correct-horse-battery1!";

describe("auth API", () => {
  beforeEach(() => {
    users.clear();
    sessions.clear();
    resets.clear();
    verificationTokens.clear();
  });

  async function registerAndVerify(
    agent: ReturnType<typeof request.agent>,
    input: { name: string; email: string; password: string },
  ) {
    const register = await agent.post("/api/auth/register").send(input);
    expect(register.status).toBe(201);
    expect(register.body.requiresVerification).toBe(true);
    expect(register.body.user).toBeUndefined();
    const verified = await agent.post("/api/auth/verify-email").send({
      email: input.email,
      code: register.body.verificationCode,
    });
    expect(verified.status).toBe(200);
    return { register, verified };
  }

  it("registers, verifies email, reads the current user, and never returns passwordHash", async () => {
    const agent = request.agent(app);
    const { register, verified } = await registerAndVerify(agent, {
      name: "Ada Lovelace",
      email: "ada@example.com",
      password,
    });

    expect(register.body.requiresVerification).toBe(true);
    expect(register.body.email).toBe("ada@example.com");
    expect(typeof register.body.verificationCode).toBe("string");
    expect(verified.body.user.email).toBe("ada@example.com");
    expect(verified.body.user.role).toBe("user");
    expect(verified.body.user).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(register.body)).not.toContain(password);
    expect(hasLeakedSecret(JSON.stringify(register.body))).toBe(false);

    const duplicate = await agent.post("/api/auth/register").send({
      name: "Ada",
      email: "ada@example.com",
      password,
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("EMAIL_TAKEN");

    const invalid = await request(app).post("/api/auth/login").send({
      email: "ada@example.com",
      password: "wrong-password",
    });
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe("INVALID_CREDENTIALS");

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("ada@example.com");
    expect(me.body.user).not.toHaveProperty("passwordHash");
  });

  it("does not issue a session until the email code is verified", async () => {
    const agent = request.agent(app);
    const register = await agent.post("/api/auth/register").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password,
    });
    expect(register.status).toBe(201);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);

    const login = await agent.post("/api/auth/login").send({
      email: "ada@example.com",
      password,
    });
    expect(login.status).toBe(403);
    expect(login.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect(login.body.requiresVerification).toBe(true);
    expect(typeof login.body.verificationCode).toBe("string");

    const stillMe = await agent.get("/api/auth/me");
    expect(stillMe.status).toBe(401);

    const verified = await agent.post("/api/auth/verify-email").send({
      email: "ada@example.com",
      code: login.body.verificationCode,
    });
    expect(verified.status).toBe(200);
    expect((await agent.get("/api/auth/me")).status).toBe(200);
  });

  it("rejects unauthenticated /me and revoked sessions after logout", async () => {
    const agent = request.agent(app);
    await registerAndVerify(agent, {
      name: "Grace Hopper",
      email: "grace@example.com",
      password,
    });

    const loggedOut = await agent.post("/api/auth/logout");
    expect(loggedOut.status).toBe(200);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("issues a password reset token in test mode", async () => {
    const agent = request.agent(app);
    await registerAndVerify(agent, {
      name: "Alan Turing",
      email: "alan@example.com",
      password,
    });

    const unknown = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "missing@example.com" });
    expect(unknown.status).toBe(200);
    expect(unknown.body.ok).toBe(true);
    expect(unknown.body.resetToken).toBeUndefined();

    const forgot = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "alan@example.com" });
    expect(forgot.status).toBe(200);
    expect(typeof forgot.body.resetToken).toBe("string");
    expect(forgot.body.resetToken).toMatch(/^\d{6}$/);

    const reset = await request(app).post("/api/auth/reset-password").send({
      email: "alan@example.com",
      token: forgot.body.resetToken,
      password: "New-password-123!",
    });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({
      email: "alan@example.com",
      password,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/auth/login").send({
      email: "alan@example.com",
      password: "New-password-123!",
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects an expired or unknown reset code", async () => {
    const agent = request.agent(app);
    await registerAndVerify(agent, {
      name: "Alan Turing",
      email: "alan@example.com",
      password,
    });

    const forgot = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "alan@example.com" });

    for (const reset of resets.values()) {
      reset.expiresAt = new Date(Date.now() - 1000);
    }

    const expired = await request(app).post("/api/auth/reset-password").send({
      email: "alan@example.com",
      token: forgot.body.resetToken,
      password: "New-password-123!",
    });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe("RESET_TOKEN_INVALID");
    expect(expired.body.error.message).toMatch(/invalid or has expired/i);

    const unknown = await request(app).post("/api/auth/reset-password").send({
      email: "alan@example.com",
      code: "000000",
      password: "New-password-123!",
    });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe("RESET_TOKEN_INVALID");
  });

  it("resends a verification code without revealing whether the email exists", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password,
    });

    const missing = await request(app).post("/api/auth/resend-code").send({ email: "missing@example.com" });
    expect(missing.status).toBe(200);
    expect(missing.body).toEqual({ ok: true });

    const resend = await request(app).post("/api/auth/resend-code").send({ email: "ada@example.com" });
    expect(resend.status).toBe(200);
    expect(resend.body).toEqual({ ok: true });

    const bad = await request(app)
      .post("/api/auth/verify-email")
      .send({ email: "ada@example.com", code: "000000" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("INVALID_VERIFICATION_CODE");
  });

  it("returns a clear JSON error when login validation fails", async () => {
    const response = await request(app).post("/api/auth/login").send({
      email: "not-an-email",
      password: "whatever",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(typeof response.body.error.message).toBe("string");
    expect(response.body.error.message.length).toBeGreaterThan(0);
  });

  it("rejects passwords shorter than 6 characters with a clear JSON error", async () => {
    const response = await request(app).post("/api/auth/register").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "short",
    });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
    expect(response.body.error.message).toBe("Password must be at least 6 characters");
  });

  it("returns a clear Google configuration error instead of faking login", async () => {
    const redirect = await request(app).get("/api/auth/google");
    expect(redirect.status).toBe(302);
    expect(String(redirect.headers.location)).toContain("google_not_configured");

    const post = await request(app).post("/api/auth/google").send({ idToken: "fake" });
    expect(post.status).toBe(503);
    expect(post.body.error.code).toBe("GOOGLE_NOT_CONFIGURED");
  });
});
