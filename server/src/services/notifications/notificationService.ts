import type { NotificationType, PublicNotification } from "@Ken/shared";
import { Notification } from "../../models/Notification.js";
import { AppError } from "../../utils/AppError.js";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export function toPublicNotification(doc: {
  id?: string;
  _id?: { toString(): string };
  type: NotificationType;
  title: string;
  body: string;
  readAt?: Date | string | null;
  createdAt?: Date | string;
}): PublicNotification {
  const notification: PublicNotification = {
    id: doc.id ?? String(doc._id),
    type: doc.type,
    title: doc.title,
    body: doc.body,
    createdAt: iso(doc.createdAt),
  };
  if (doc.readAt) {
    notification.readAt = iso(doc.readAt);
  }
  return notification;
}

export async function createNotification(
  userId: string,
  input: { type: NotificationType; title: string; body: string; data?: Record<string, unknown> },
): Promise<PublicNotification> {
  const created = await Notification.create({
    userId,
    type: input.type,
    title: input.title,
    body: input.body,
    ...(input.data ? { data: input.data } : {}),
  });
  return toPublicNotification(created);
}

export async function listNotifications(userId: string, limit = 50): Promise<PublicNotification[]> {
  const docs = await Notification.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), 100));
  return docs.map((doc) => toPublicNotification(doc));
}

export async function markNotificationRead(userId: string, notificationId: string): Promise<PublicNotification> {
  const doc = await Notification.findOne({ _id: notificationId, userId });
  if (!doc) {
    throw new AppError("Notification not found", { statusCode: 404, code: "NOTIFICATION_NOT_FOUND" });
  }
  if (!doc.readAt) {
    doc.readAt = new Date();
    await doc.save();
  }
  return toPublicNotification(doc);
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId, readAt: { $exists: false } },
    { $set: { readAt: new Date() } },
  );
  return result.modifiedCount;
}
