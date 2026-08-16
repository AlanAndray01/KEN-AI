import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { summarizeUsage } from "../services/chat/usageService.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function adminUsageHandler(_req: Request, res: Response): Promise<void> {
  const usage = await summarizeUsage();
  res.status(200).json({ usage });
}

export async function myUsageHandler(req: Request, res: Response): Promise<void> {
  const usage = await summarizeUsage({ userId: requireUserId(req) });
  res.status(200).json({ usage });
}
