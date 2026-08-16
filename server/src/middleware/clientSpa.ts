import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";
import { isProduction } from "../config/env.js";

function clientDistDir(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../client/dist");
}

export function mountClientSpa(app: Express): void {
  if (!isProduction) return;

  const dist = clientDistDir();
  const indexHtml = path.join(dist, "index.html");
  if (!fs.existsSync(indexHtml)) return;

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
