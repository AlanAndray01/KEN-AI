import mongoose from "mongoose";
import type { GptCategory, ModelCapability, PublicCustomGpt } from "@aether/shared";
import { CustomGPT } from "../../models/CustomGPT.js";
import { AppError } from "../../utils/AppError.js";
import { loadOwnedFiles } from "../storage/fileService.js";

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export interface GptWriteInput {
  name: string;
  description?: string;
  avatar?: string;
  instructions?: string;
  conversationStarters?: string[];
  knowledgeFileIds?: string[];
  capabilities?: ModelCapability[];
  modelId?: string;
  providerId?: string;
  visibility?: PublicCustomGpt["visibility"];
  category?: GptCategory;
}

export function toPublicGpt(
  doc: {
    id?: string;
    _id?: { toString(): string };
    name: string;
    description?: string | null;
    avatar?: string | null;
    instructions?: string | null;
    conversationStarters?: string[] | null;
    knowledgeFileIds?: Array<{ toString(): string } | string> | null;
    capabilities?: ModelCapability[] | null;
    modelId?: string | null;
    providerId?: string | null;
    creatorId: { toString(): string } | string;
    visibility: PublicCustomGpt["visibility"];
    category: GptCategory;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  },
  viewerId: string,
  options: { includeInstructions?: boolean } = {},
): PublicCustomGpt {
  const creatorId = String(doc.creatorId);
  const mine = creatorId === viewerId;
  const includeInstructions = options.includeInstructions ?? mine;
  return {
    id: doc.id ?? String(doc._id),
    name: doc.name,
    ...(doc.description ? { description: doc.description } : {}),
    ...(doc.avatar ? { avatar: doc.avatar } : {}),
    ...(includeInstructions && doc.instructions ? { instructions: doc.instructions } : {}),
    conversationStarters: doc.conversationStarters ?? [],
    knowledgeFileIds: (doc.knowledgeFileIds ?? []).map((id) => String(id)),
    capabilities: doc.capabilities ?? [],
    ...(doc.modelId ? { modelId: doc.modelId } : {}),
    ...(doc.providerId ? { providerId: doc.providerId } : {}),
    creatorId,
    visibility: doc.visibility,
    category: doc.category,
    mine,
    createdAt: iso(doc.createdAt),
    updatedAt: iso(doc.updatedAt),
  };
}

export async function listGpts(
  userId: string,
  options: { scope?: "mine" | "explore" | "usable"; q?: string; category?: GptCategory } = {},
): Promise<PublicCustomGpt[]> {
  const scope = options.scope ?? "usable";
  const filter: Record<string, unknown> =
    scope === "mine"
      ? { creatorId: userId }
      : scope === "explore"
        ? { visibility: "public" }
        : { $or: [{ creatorId: userId }, { visibility: "public" }] };

  if (options.category) filter.category = options.category;
  if (options.q?.trim()) {
    filter.$text = { $search: options.q.trim() };
  }

  const docs = await CustomGPT.find(filter).sort({ updatedAt: -1 }).limit(60);
  return docs.map((doc) => toPublicGpt(doc, userId, { includeInstructions: false }));
}

export async function getAccessibleGpt(userId: string, gptId: string, includeInstructions = false) {
  if (!mongoose.isValidObjectId(gptId)) {
    throw new AppError("GPT not found", { statusCode: 404, code: "GPT_NOT_FOUND" });
  }
  const doc = await CustomGPT.findById(gptId);
  if (!doc) {
    throw new AppError("GPT not found", { statusCode: 404, code: "GPT_NOT_FOUND" });
  }
  const mine = String(doc.creatorId) === userId;
  if (!mine && doc.visibility === "private") {
    throw new AppError("GPT not found", { statusCode: 404, code: "GPT_NOT_FOUND" });
  }
  return { doc, public: toPublicGpt(doc, userId, { includeInstructions: includeInstructions || mine }) };
}

export async function createGpt(userId: string, input: GptWriteInput): Promise<PublicCustomGpt> {
  await assertOwnedKnowledgeFiles(userId, input.knowledgeFileIds);
  const created = await CustomGPT.create({
    name: input.name,
    description: input.description ?? "",
    instructions: input.instructions ?? "",
    conversationStarters: input.conversationStarters ?? [],
    knowledgeFileIds: input.knowledgeFileIds ?? [],
    capabilities: input.capabilities ?? [],
    creatorId: userId,
    visibility: input.visibility ?? "private",
    category: input.category ?? "other",
    ...(input.avatar ? { avatar: input.avatar } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
  });
  return toPublicGpt(created, userId, { includeInstructions: true });
}

export async function updateGpt(userId: string, gptId: string, input: Partial<GptWriteInput>): Promise<PublicCustomGpt> {
  const { doc } = await getOwnedGpt(userId, gptId);
  if (input.knowledgeFileIds) {
    await assertOwnedKnowledgeFiles(userId, input.knowledgeFileIds);
  }
  if (input.name !== undefined) doc.name = input.name;
  if (input.description !== undefined) doc.description = input.description;
  if (input.avatar !== undefined) doc.avatar = input.avatar;
  if (input.instructions !== undefined) doc.instructions = input.instructions;
  if (input.conversationStarters !== undefined) doc.conversationStarters = input.conversationStarters;
  if (input.knowledgeFileIds !== undefined) {
    doc.knowledgeFileIds = input.knowledgeFileIds.map((id) => new mongoose.Types.ObjectId(id));
  }
  if (input.capabilities !== undefined) doc.capabilities = input.capabilities;
  if (input.modelId !== undefined) doc.modelId = input.modelId;
  if (input.providerId !== undefined) doc.providerId = input.providerId;
  if (input.visibility !== undefined) doc.visibility = input.visibility;
  if (input.category !== undefined) doc.category = input.category;
  await doc.save();
  return toPublicGpt(doc, userId, { includeInstructions: true });
}

export async function deleteGpt(userId: string, gptId: string): Promise<void> {
  const { doc } = await getOwnedGpt(userId, gptId);
  await doc.deleteOne();
}

async function getOwnedGpt(userId: string, gptId: string) {
  const result = await getAccessibleGpt(userId, gptId, true);
  if (!result.public.mine) {
    throw new AppError("You cannot edit this GPT", { statusCode: 403, code: "GPT_FORBIDDEN" });
  }
  return result;
}

async function assertOwnedKnowledgeFiles(userId: string, fileIds?: string[]): Promise<void> {
  if (!fileIds?.length) return;
  await loadOwnedFiles(userId, fileIds);
}
