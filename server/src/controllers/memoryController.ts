import type { Request, Response } from "express";
import { createMemorySchema, patchMemorySchema, upsertInstructionSchema } from "@aether/shared";
import {
  createMemory,
  deleteMemory,
  listMemories,
  updateMemory,
} from "../services/memory/memoryService.js";
import { getInstructions, upsertInstructions } from "../services/memory/instructionService.js";
import { AppError } from "../utils/AppError.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function listMemoriesHandler(req: Request, res: Response): Promise<void> {
  const limit = Number(req.query.limit);
  const memories = await listMemories(requireUserId(req), Number.isFinite(limit) ? limit : 40);
  res.status(200).json({ memories });
}

export async function createMemoryHandler(req: Request, res: Response): Promise<void> {
  const body = createMemorySchema.parse(req.body);
  const memory = await createMemory(requireUserId(req), {
    content: body.content,
    ...(body.conversationId ? { conversationId: body.conversationId } : {}),
  });
  res.status(201).json({ memory });
}

export async function updateMemoryHandler(req: Request, res: Response): Promise<void> {
  const body = patchMemorySchema.parse(req.body);
  const memory = await updateMemory(requireUserId(req), req.params.id ?? "", body.content);
  res.status(200).json({ memory });
}

export async function deleteMemoryHandler(req: Request, res: Response): Promise<void> {
  await deleteMemory(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ ok: true });
}

export async function getInstructionsHandler(req: Request, res: Response): Promise<void> {
  const instructions = await getInstructions(requireUserId(req));
  res.status(200).json({ instructions });
}

export async function upsertInstructionsHandler(req: Request, res: Response): Promise<void> {
  const body = upsertInstructionSchema.parse(req.body);
  const instructions = await upsertInstructions(requireUserId(req), body);
  res.status(200).json({ instructions });
}
