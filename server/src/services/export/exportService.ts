import mongoose from "mongoose";
import type { ExportFormat } from "@Ken/shared";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { findOwnedConversation } from "../chat/conversationService.js";
import { createNotification } from "../notifications/notificationService.js";
import {
  exportExtension,
  exportMimeType,
  formatExport,
  safeExportFilename,
  type ExportConversation,
} from "./formatExport.js";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

async function messagesForConversation(
  userId: string,
  conversationId: mongoose.Types.ObjectId,
): Promise<ExportConversation["messages"]> {
  const docs = await Message.find({
    conversationId,
    userId,
    role: { $in: ["user", "assistant"] },
    "metadata.superseded": { $ne: true },
  })
    .sort({ createdAt: 1 })
    .limit(5000);

  return docs.map((doc) => ({
    role: doc.role,
    content: doc.content ?? "",
    createdAt: iso(doc.createdAt),
  }));
}

export async function exportConversation(
  userId: string,
  conversationId: string,
  format: ExportFormat,
): Promise<{ filename: string; mimeType: string; body: string }> {
  const conversation = await findOwnedConversation(userId, conversationId);
  const payload: ExportConversation = {
    id: String(conversation._id),
    title: conversation.title,
    createdAt: iso(conversation.createdAt),
    messages: await messagesForConversation(userId, conversation._id),
  };
  const body = formatExport([payload], format);
  return {
    filename: `${safeExportFilename(conversation.title)}.${exportExtension(format)}`,
    mimeType: exportMimeType(format),
    body,
  };
}

export async function exportAllConversations(
  userId: string,
  format: ExportFormat,
): Promise<{ filename: string; mimeType: string; body: string }> {
  const conversations = await Conversation.find({ userId, archived: false }).sort({ updatedAt: -1 }).limit(200);
  const payload: ExportConversation[] = [];
  for (const conversation of conversations) {
    payload.push({
      id: String(conversation._id),
      title: conversation.title,
      createdAt: iso(conversation.createdAt),
      messages: await messagesForConversation(userId, conversation._id),
    });
  }
  const body = formatExport(payload, format);
  await createNotification(userId, {
    type: "export",
    title: "Chat export ready",
    body: `Exported ${payload.length} conversation${payload.length === 1 ? "" : "s"} as ${format.toUpperCase()}.`,
  });
  return {
    filename: `Ken-chats.${exportExtension(format)}`,
    mimeType: exportMimeType(format),
    body,
  };
}
