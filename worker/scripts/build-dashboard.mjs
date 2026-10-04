import { spawnSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(process.execPath, [
  path.join(root, "node_modules/wrangler/bin/wrangler.js"),
  "deploy", "--dry-run", "--outdir", ".wrangler/dashboard",
], { cwd: root, stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false",
  WRANGLER_LOG_PATH: path.join(root, ".wrangler/dashboard-build.log") } });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
copyFileSync(path.join(root, ".wrangler/dashboard/index.js"), path.join(root, "Ken-AI-Worker.js"));
console.log("Paste worker/Ken-AI-Worker.js into Cloudflare's kenai Worker editor. No deployment was performed.");
