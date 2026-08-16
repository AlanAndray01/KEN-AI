import request from "supertest";
import { app } from "../app.js";
import { hasLeakedSecret } from "../utils/redact.js";

async function main(): Promise<void> {
  try {
    const response = await request(app).get("/api/health");
    const payload = JSON.stringify(response.body);
    if (hasLeakedSecret(payload) || payload.toLowerCase().includes("api_key")) {
      throw new Error("Health payload contained a redacted secret");
    }
    if (response.status !== 200) {
      process.stderr.write("Health check failed\n");
      process.exitCode = 1;
      return;
    }
    const status = typeof response.body.status === "string" ? response.body.status : "unknown";
    const database =
      response.body.database && typeof response.body.database.status === "string"
        ? response.body.database.status
        : "unknown";
    process.stdout.write(`status=${status} database=${database}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Health verification failed";
    if (hasLeakedSecret(message)) {
      process.stderr.write("Health verification failed\n");
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
  }
}

void main();
