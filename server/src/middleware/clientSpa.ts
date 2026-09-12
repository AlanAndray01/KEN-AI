import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import { isProduction } from "../config/env.js";

function clientDistDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
}

/**
 * Whether this process will also serve the built client.
 *
 * Render builds only `shared` and `server`, so `client/dist` is absent there and
 * the process is an API host alone. Callers use this to decide whether the host
 * should describe itself and send `noindex` — see `mountApiHost`.
 */
export function clientSpaAvailable(): boolean {
  if (!isProduction) return false;
  return fs.existsSync(path.join(clientDistDir(), "index.html"));
}

export function mountClientSpa(app: Express): void {
  if (!clientSpaAvailable()) return;

  const dist = clientDistDir();
  const indexHtml = path.join(dist, "index.html");

  app.use(express.static(dist, { index: false }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (req.path.startsWith("/api")) {
      next();
      return;
    }
    res.sendFile(indexHtml);
  });
}
