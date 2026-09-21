import type { Request, Response } from "express";
import { createGptSchema, listGptsQuerySchema, patchGptSchema } from "@Ken/shared";
import { createGpt, deleteGpt, getAccessibleGpt, listGpts, updateGpt } from "../services/gpts/gptService.js";
import { AppError } from "../utils/AppError.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function listGptsHandler(req: Request, res: Response): Promise<void> {
  const query = listGptsQuerySchema.parse(req.query);
  const gpts = await listGpts(requireUserId(req), {
    ...(query.scope ? { scope: query.scope } : {}),
    ...(query.q ? { q: query.q } : {}),
    ...(query.category ? { category: query.category } : {}),
  });
  res.status(200).json({ gpts });
}

export async function getGptHandler(req: Request, res: Response): Promise<void> {
  const { public: gpt } = await getAccessibleGpt(requireUserId(req), req.params.id ?? "", true);
  res.status(200).json({ gpt });
}

export async function createGptHandler(req: Request, res: Response): Promise<void> {
  const body = createGptSchema.parse(req.body);
  const gpt = await createGpt(requireUserId(req), {
    name: body.name,
    ...(body.description ? { description: body.description } : {}),
    ...(body.avatar ? { avatar: body.avatar } : {}),
    ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
    ...(body.conversationStarters ? { conversationStarters: body.conversationStarters } : {}),
    ...(body.knowledgeFileIds ? { knowledgeFileIds: body.knowledgeFileIds } : {}),
    ...(body.capabilities ? { capabilities: body.capabilities } : {}),
    ...(body.modelId ? { modelId: body.modelId } : {}),
    ...(body.providerId ? { providerId: body.providerId } : {}),
    visibility: body.visibility,
    category: body.category,
  });
  res.status(201).json({ gpt });
}

export async function updateGptHandler(req: Request, res: Response): Promise<void> {
  const body = patchGptSchema.parse(req.body);
  const gpt = await updateGpt(requireUserId(req), req.params.id ?? "", {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.description !== undefined ? { description: body.description } : {}),
    ...(body.avatar !== undefined ? { avatar: body.avatar } : {}),
    ...(body.instructions !== undefined ? { instructions: body.instructions } : {}),
    ...(body.conversationStarters !== undefined ? { conversationStarters: body.conversationStarters } : {}),
    ...(body.knowledgeFileIds !== undefined ? { knowledgeFileIds: body.knowledgeFileIds } : {}),
    ...(body.capabilities !== undefined ? { capabilities: body.capabilities } : {}),
    ...(body.modelId !== undefined ? { modelId: body.modelId } : {}),
    ...(body.providerId !== undefined ? { providerId: body.providerId } : {}),
    ...(body.visibility !== undefined ? { visibility: body.visibility } : {}),
    ...(body.category !== undefined ? { category: body.category } : {}),
  });
  res.status(200).json({ gpt });
}

export async function deleteGptHandler(req: Request, res: Response): Promise<void> {
  await deleteGpt(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ ok: true });
}
