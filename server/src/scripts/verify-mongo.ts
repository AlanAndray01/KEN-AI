import { connectDatabase, disconnectDatabase, getDatabaseHealthStatus } from "../config/database.js";
import { hasLeakedSecret } from "../utils/redact.js";

async function main(): Promise<void> {
  try {
    await connectDatabase();
    const status = getDatabaseHealthStatus();
    const payload = JSON.stringify({ database: status });
    if (hasLeakedSecret(payload)) {
      throw new Error("Verification output contained a redacted secret");
    }
    process.stdout.write(`${payload}\n`);
    if (status !== "connected") {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database verification failed";
    if (hasLeakedSecret(message)) {
      process.stderr.write("Database verification failed\n");
    } else {
      process.stderr.write(`${message}\n`);
    }
    process.exitCode = 1;
  } finally {
    await disconnectDatabase();
  }
}

void main();
