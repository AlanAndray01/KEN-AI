import path from "node:path";
import express, { type Response } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
vi.mock("../config/env.js", () => ({ isProduction: true }));
vi.mock("node:fs", () => ({ default: { existsSync: () => true } }));
const { mountClientSpa } = await import("./clientSpa.js");

describe("combined client host", () => {
  it("serves route HTML from client/dist, noindexes private routes, and returns real 404s", async () => {
    const app = express();
    app.use((_req, res, next) => {
      res.sendFile = function(file: string) { this.send(file); return this; } as Response["sendFile"];
      next();
    });
    mountClientSpa(app);
    const privacy = await request(app).get("/privacy");
    expect(privacy.status).toBe(200);
    expect(privacy.text).toBe(path.resolve("../client/dist/privacy/index.html"));
    const privatePage = await request(app).get("/chat/abc");
    expect(privatePage.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(privatePage.text).toContain("private.html");
    expect((await request(app).get("/missing-page")).status).toBe(404);
  });
});
