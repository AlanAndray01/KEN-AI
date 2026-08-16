import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";
import { createShare, getPublicShare, getShare, revokeShare } from "../services/share/shareService.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function getConversationShareHandler(req: Request, res: Response): Promise<void> {
  const share = await getShare(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ share });
}

export async function createConversationShareHandler(req: Request, res: Response): Promise<void> {
  const share = await createShare(requireUserId(req), req.params.id ?? "");
  res.status(201).json({ share });
}

export async function revokeConversationShareHandler(req: Request, res: Response): Promise<void> {
  await revokeShare(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ ok: true });
}

export async function getPublicShareHandler(req: Request, res: Response): Promise<void> {
  const conversation = await getPublicShare(req.params.token ?? "");
  res.status(200).json({ conversation, readOnly: true });
}
