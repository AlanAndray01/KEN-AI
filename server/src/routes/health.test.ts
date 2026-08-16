import request from "supertest";
import { describe, expect, it } from "vitest";
import { APP_SERVICE_ID } from "@aether/shared";
import { app } from "../app.js";
import { getDatabaseHealthStatus } from "../config/database.js";
import { hasLeakedSecret } from "../utils/redact.js";

describe("GET /api/health", () => {
  it("returns service health and database status without secrets", async () => {
    const response = await request(app).get("/api/health");
    const databaseStatus = getDatabaseHealthStatus();

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: databaseStatus === "disconnected" ? "degraded" : "ok",
      service: APP_SERVICE_ID,
      database: { status: databaseStatus },
    });
    expect(["ok", "degraded", "error"]).toContain(response.body.status);
    expect(["connected", "disconnected", "not_configured"]).toContain(
      response.body.database.status,
    );
    expect(typeof response.body.timestamp).toBe("string");
    expect(hasLeakedSecret(JSON.stringify(response.body))).toBe(false);
    expect(JSON.stringify(response.body).toLowerCase()).not.toContain("api_key");
    expect(response.headers["x-request-id"]).toBeTruthy();
  });
});
