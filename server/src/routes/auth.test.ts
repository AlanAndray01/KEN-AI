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

const users = new Map<string, UserDoc>();
const sessions = new Map<string, SessionDoc>();
const resets = new Map<string, ResetDoc>();

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
    findOne: vi.fn((query: { tokenHash: string }) => {
      const found = resets.get(query.tokenHash);
      if (!found || found.usedAt || found.expiresAt <= new Date()) {
        return thenable(null);
      }
      return thenable(found);
    }),
  },
}));

const { app } = await import("../app.js");
const { hasLeakedSecret } = await import("../utils/redact.js");

const password = "correct-horse-battery";

describe("auth API", () => {
  beforeEach(() => {
    users.clear();
    sessions.clear();
    resets.clear();
  });

  it("registers, logs in, reads the current user, and never returns passwordHash", async () => {
    const agent = request.agent(app);
    const register = await agent.post("/api/auth/register").send({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password,
    });

    expect(register.status).toBe(201);
    expect(register.body.user.email).toBe("ada@example.com");
    expect(register.body.user.role).toBe("user");
    expect(register.body.user).not.toHaveProperty("passwordHash");
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

  it("rejects unauthenticated /me and revoked sessions after logout", async () => {
    const agent = request.agent(app);
    await agent.post("/api/auth/register").send({
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
    await agent.post("/api/auth/register").send({
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

    const reset = await request(app).post("/api/auth/reset-password").send({
      token: forgot.body.resetToken,
      password: "new-password-123",
    });
    expect(reset.status).toBe(200);

    const oldLogin = await request(app).post("/api/auth/login").send({
      email: "alan@example.com",
      password,
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/api/auth/login").send({
      email: "alan@example.com",
      password: "new-password-123",
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.user).not.toHaveProperty("passwordHash");
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
