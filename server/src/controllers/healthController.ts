import type { Request, Response } from "express";
import { APP_SERVICE_ID, type HealthResponse } from "@aether/shared";
import { getDatabaseHealthStatus } from "../config/database.js";

export function getHealth(_req: Request, res: Response): void {
  const databaseStatus = getDatabaseHealthStatus();

  const body: HealthResponse = {
    status: databaseStatus === "disconnected" ? "degraded" : "ok",
    timestamp: new Date().toISOString(),
    service: APP_SERVICE_ID,
    database: {
      status: databaseStatus,
    },
  };

  res.status(200).json(body);
}
