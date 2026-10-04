import mongoose from "mongoose";
import type { ExportFormat } from "@Ken/shared";
import { Conversation } from "../../models/Conversation.js";
import { Message } from "../../models/Message.js";
import { AppError } from "../../utils/AppError.js";
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

// Exports are returned as one download by the existing API. Page database
// reads, and fail explicitly before accumulating an unbounded response.
const MAX_EXPORT_BYTES = 32 * 1024 * 1024;
function charge(budget: { bytes: number }, value: unknown): void {
  budget.bytes += Buffer.byteLength(JSON.stringify(value), "utf8") + 256;
  if (budget.bytes > MAX_EXPORT_BYTES) {
    throw new AppError("Export exceeds 32 MiB. Export individual conversations instead.", {
      statusCode: 413, code: "EXPORT_TOO_LARGE",
    });
  }
}

async function messagesForConversation(
  userId: string,
  conversationId: mongoose.Types.ObjectId,
  cutoff: Date,
  budget: { bytes: number },
): Promise<ExportConversation["messages"]> {
  const result: ExportConversation["messages"] = [];
  let cursor: { createdAt: Date; _id: mongoose.Types.ObjectId } | undefined;
  while (true) {
    const docs = await Message.find({
    conversationId,
    userId,
    role: { $in: ["user", "assistant"] },
    "metadata.superseded": { $ne: true },
    createdAt: { $lte: cutoff },
    ...(cursor ? { $or: [
      { createdAt: { $gt: cursor.createdAt } },
      { createdAt: cursor.createdAt, _id: { $gt: cursor._id } },
    ] } : {}),
  })
    .sort({ createdAt: 1, _id: 1 }).limit(250).lean();
    for (const doc of docs) {
      const message = { role: doc.role, content: doc.content ?? "", createdAt: iso(doc.createdAt) };
      charge(budget, message);
      result.push(message);
    }
    const last = docs.at(-1);
    if (docs.length < 250 || !last) break;
    cursor = { createdAt: last.createdAt, _id: last._id };
  }
  return result;
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
    messages: await messagesForConversation(userId, conversation._id, new Date(), { bytes: 0 }),
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
  // Cutoff excludes new records; concurrent edits/deletions may be reflected.
  // This is a bounded live export, not a transaction snapshot.
  const cutoff = new Date();
  const budget = { bytes: 0 };
  let after: mongoose.Types.ObjectId | undefined;
  const payload: ExportConversation[] = [];
  while (true) {
  const conversations = await Conversation.find({ userId, createdAt: { $lte: cutoff },
    ...(after ? { _id: { $gt: after } } : {}),
  }).sort({ _id: 1 }).limit(100).lean();
  for (const conversation of conversations) {
    charge(budget, { id: conversation._id, title: conversation.title });
    payload.push({
      id: String(conversation._id),
      title: conversation.title,
      createdAt: iso(conversation.createdAt),
      messages: await messagesForConversation(userId, conversation._id, cutoff, budget),
    });
  }
  const last = conversations.at(-1);
  if (conversations.length < 100 || !last) break;
  after = last._id;
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
