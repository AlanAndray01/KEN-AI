/**
 * Live round trip against the configured file storage: upload a small test
 * object, read it back, compare, delete it, and confirm it is gone.
 *
 *   npm run check:storage -w @Ken/server
 *
 * Uses the same STORAGE_* settings and code path as uploads in the app, so a
 * pass here means chat attachments will work. Run it with the R2 settings in
 * server/.env before switching production over. Never prints keys or secrets.
 */
import { randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { missingStorageSettings, storageService } from "../services/storage/index.js";

async function main(): Promise<void> {
  console.log(`Storage provider: ${env.STORAGE_PROVIDER}`);
  if (env.STORAGE_PROVIDER === "local") {
    console.log("Local disk storage is in use. On Render its files are wiped on every restart; set STORAGE_PROVIDER=r2.");
  }
  const missing = missingStorageSettings(env);
  if (missing.length > 0) {
    console.error(`✗ Missing settings: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const key = `ken-storage-check/${randomUUID()}.txt`;
  const payload = Buffer.from(`Ken storage check ${new Date().toISOString()}`);
  const step = async (label: string, run: () => Promise<void>): Promise<void> => {
    await run();
    console.log(`✓ ${label}`);
  };

  try {
    await step("upload", async () => {
      await storageService.put({ key, buffer: payload, mimeType: "text/plain" });
    });
    await step("read back", async () => {
      const read = await storageService.get(key);
      if (!read.equals(payload)) throw new Error("the stored bytes do not match what was uploaded");
    });
    await step("delete", async () => {
      await storageService.delete(key);
      if (await storageService.exists(key)) throw new Error("the test object is still there after delete");
    });
    console.log(
      env.STORAGE_PROVIDER === "local"
        ? "Local file storage works on this machine."
        : "File storage works. Uploaded files will survive restarts and redeploys.",
    );
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    console.error("The log line above, if any, carries the provider's own reason (for example SignatureDoesNotMatch or NoSuchBucket).");
    process.exitCode = 1;
  }
}

await main();
