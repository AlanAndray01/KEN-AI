import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../app.js";

describe("unknown routes", () => {
  it("returns a 404 payload without a stack trace", async () => {
    const response = await request(app).get("/api/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("NOT_FOUND");
    expect(response.body.error.message).toBeDefined();
    expect(response.body.error.stack).toBeUndefined();
  });
});
