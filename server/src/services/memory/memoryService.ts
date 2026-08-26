import mongoose from "mongoose";
import type { PublicMemory } from "@Ken/shared";
import { Memory } from "../../models/Memory.js";
import { AppError } from "../../utils/AppError.js";

const MAX_MEMORIES = 100;

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export function toPublicMemory(doc: {
  id?: string;
  _id?: { toString(): string };
  content: string;
  source?: string;
  conversationId?: { toString(): string } | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}): PublicMemory {
  return {
    id: doc.id ?? String(doc._id),
    content: doc.content,
    source: doc.source === "inferred" ? "inferred" : "manual",
    ...(doc.conversationId ? { conversationId: String(doc.conversationId) } : {}),
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

export async function listMemories(userId: string, limit = 40): Promise<PublicMemory[]> {
  const docs = await Memory.find({ userId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(limit, 1), MAX_MEMORIES));
  return docs.map((doc) => toPublicMemory(doc));
}

export async function createMemory(
  userId: string,
  input: { content: string; conversationId?: string },
): Promise<PublicMemory> {
  const count = await Memory.countDocuments({ userId });
  if (count >= MAX_MEMORIES) {
    throw new AppError("Memory limit reached", { statusCode: 400, code: "MEMORY_LIMIT" });
  }
  if (input.conversationId && !mongoose.isValidObjectId(input.conversationId)) {
    throw new AppError("Conversation not found", { statusCode: 404, code: "CONVERSATION_NOT_FOUND" });
  }
  const created = await Memory.create({
    userId,
    content: input.content,
    source: "manual",
    ...(input.conversationId ? { conversationId: input.conversationId } : {}),
  });
  return toPublicMemory(created);
}

export async function updateMemory(userId: string, memoryId: string, content: string): Promise<PublicMemory> {
  const doc = await findOwnedMemory(userId, memoryId);
  doc.content = content;
  await doc.save();
  return toPublicMemory(doc);
}

export async function deleteMemory(userId: string, memoryId: string): Promise<void> {
  const doc = await findOwnedMemory(userId, memoryId);
  await doc.deleteOne();
}

async function findOwnedMemory(userId: string, memoryId: string) {
  if (!mongoose.isValidObjectId(memoryId)) {
    throw new AppError("Memory not found", { statusCode: 404, code: "MEMORY_NOT_FOUND" });
  }
  const doc = await Memory.findOne({ _id: memoryId, userId });
  if (!doc) {
    throw new AppError("Memory not found", { statusCode: 404, code: "MEMORY_NOT_FOUND" });
  }
  return doc;
}
