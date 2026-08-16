import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../services/notifications/notificationService.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function listNotificationsHandler(req: Request, res: Response): Promise<void> {
  const notifications = await listNotifications(requireUserId(req));
  res.status(200).json({ notifications });
}

export async function markNotificationReadHandler(req: Request, res: Response): Promise<void> {
  const notification = await markNotificationRead(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ notification });
}

export async function markAllNotificationsReadHandler(req: Request, res: Response): Promise<void> {
  const updated = await markAllNotificationsRead(requireUserId(req));
  res.status(200).json({ ok: true, updated });
}
