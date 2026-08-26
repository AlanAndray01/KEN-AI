import type { PublicShare, PublicSharedConversation, PublicSharedMessage } from "@Ken/shared";
import { env } from "../../config/env.js";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { SharedConversation } from "../../models/SharedConversation.js";
import { AppError } from "../../utils/AppError.js";
import { generateUrlToken } from "../auth/crypto.js";
import { findOwnedConversation } from "../chat/conversationService.js";
import { createNotification } from "../notifications/notificationService.js";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function isExpired(expiresAt: Date | undefined | null): boolean {
  return Boolean(expiresAt && expiresAt.getTime() <= Date.now());
}

function toPublicShare(doc: {
  id?: string;
  _id?: { toString(): string };
  conversationId: { toString(): string } | string;
  token: string;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
  viewCount?: number;
  createdAt?: Date | string;
}): PublicShare {
  const token = doc.token;
  const share: PublicShare = {
    id: doc.id ?? String(doc._id),
    conversationId: String(doc.conversationId),
    token,
    url: `${env.CLIENT_URL.replace(/\/$/, "")}/share/${token}`,
    isReadOnly: true,
    revoked: Boolean(doc.revokedAt),
    viewCount: doc.viewCount ?? 0,
    createdAt: iso(doc.createdAt),
  };
  if (doc.expiresAt) {
    share.expiresAt = iso(doc.expiresAt);
  }
  return share;
}

export async function getShare(userId: string, conversationId: string): Promise<PublicShare | null> {
  await findOwnedConversation(userId, conversationId);
  const doc = await SharedConversation.findOne({
    conversationId,
    userId,
    revokedAt: { $exists: false },
  }).sort({ createdAt: -1 });
  if (!doc || isExpired(doc.expiresAt)) {
    return null;
  }
  return toPublicShare(doc);
}

export async function createShare(userId: string, conversationId: string): Promise<PublicShare> {
  const conversation = await findOwnedConversation(userId, conversationId);
  const existing = await SharedConversation.findOne({
    conversationId,
    userId,
    revokedAt: { $exists: false },
  }).sort({ createdAt: -1 });
  if (existing && !isExpired(existing.expiresAt)) {
    return toPublicShare(existing);
  }

  const created = await SharedConversation.create({
    conversationId: conversation._id,
    userId,
    token: generateUrlToken(24),
    isReadOnly: true,
    viewCount: 0,
  });
  await createNotification(userId, {
    type: "share",
    title: "Share link created",
    body: `A read-only link was created for “${conversation.title}”. Anyone with the link can view this chat.`,
    data: { conversationId: String(conversation._id) },
  });
  return toPublicShare(created);
}

export async function revokeShare(userId: string, conversationId: string): Promise<void> {
  await findOwnedConversation(userId, conversationId);
  await SharedConversation.updateMany(
    { conversationId, userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date() } },
  );
}

export async function getPublicShare(token: string): Promise<PublicSharedConversation> {
  if (!token || token.length < 8) {
    throw new AppError("Share link not found", { statusCode: 404, code: "SHARE_NOT_FOUND" });
  }

  const share = await SharedConversation.findOne({ token });
  if (!share || share.revokedAt || isExpired(share.expiresAt)) {
    throw new AppError("Share link not found", { statusCode: 404, code: "SHARE_NOT_FOUND" });
  }

  const conversation = await Conversation.findById(share.conversationId);
  if (!conversation) {
    throw new AppError("Share link not found", { statusCode: 404, code: "SHARE_NOT_FOUND" });
  }

  const docs = await Message.find({
    conversationId: conversation._id,
    userId: share.userId,
    role: { $in: ["user", "assistant"] },
    "metadata.superseded": { $ne: true },
  })
    .sort({ createdAt: 1 })
    .limit(5000);

  const messages: PublicSharedMessage[] = [];
  for (const doc of docs) {
    if (doc.role !== "user" && doc.role !== "assistant") continue;
    messages.push({
      role: doc.role,
      content: doc.content ?? "",
      createdAt: iso(doc.createdAt),
    });
  }

  share.viewCount = (share.viewCount ?? 0) + 1;
  await share.save();

  return {
    title: conversation.title,
    createdAt: iso(conversation.createdAt),
    messages,
  };
}
