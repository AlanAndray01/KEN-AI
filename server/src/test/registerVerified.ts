import type { Express } from "express";
import request from "supertest";
import { expect } from "vitest";
import { cookiesFrom } from "./mongoHarness.js";

export async function registerVerified(
  app: Express,
  credentials: { name: string; email: string; password: string },
): Promise<{ cookies: string[]; userId: string }> {
  const registered = await request(app).post("/api/auth/register").send(credentials);
  expect(registered.status).toBe(201);
  expect(registered.body.requiresVerification).toBe(true);
  expect(registered.body.user).toBeUndefined();
  expect(registered.headers["set-cookie"]).toBeUndefined();
  const code = registered.body.verificationCode as string;
  expect(code).toMatch(/^\d{6}$/);

  const verified = await request(app).post("/api/auth/verify-email").send({
    email: credentials.email,
    code,
  });
  expect(verified.status).toBe(200);
  expect(verified.body.user.email).toBe(credentials.email.toLowerCase());

  return {
    cookies: cookiesFrom(verified),
    userId: String(verified.body.user.id),
  };
}
