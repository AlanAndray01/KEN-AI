import type { Request, Response } from "express";
import { exportFormatSchema } from "@aether/shared";
import { AppError } from "../utils/AppError.js";
import { exportAllConversations, exportConversation } from "../services/export/exportService.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

function sendExport(
  res: Response,
  file: { filename: string; mimeType: string; body: string },
): void {
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
  res.status(200).send(file.body);
}

export async function exportConversationHandler(req: Request, res: Response): Promise<void> {
  const format = exportFormatSchema.parse(typeof req.query.format === "string" ? req.query.format : "md");
  const file = await exportConversation(requireUserId(req), req.params.id ?? "", format);
  sendExport(res, file);
}

export async function exportAllConversationsHandler(req: Request, res: Response): Promise<void> {
  const format = exportFormatSchema.parse(typeof req.query.format === "string" ? req.query.format : "json");
  const file = await exportAllConversations(requireUserId(req), format);
  sendExport(res, file);
}
