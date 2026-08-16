import type { Request, Response } from "express";
import {
  abortGenerationSchema,
  createConversationSchema,
  messageFeedbackSchema,
  patchConversationSchema,
  sendMessageSchema,
} from "@aether/shared";
import { AppError } from "../utils/AppError.js";
import { writeSseEvent, writeSseHeaders } from "../utils/sse.js";
import {
  abortGeneration,
  prepareRegenerate,
  prepareSend,
  runGeneration,
} from "../services/chat/chatService.js";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  setMessageFeedback,
  updateConversation,
} from "../services/chat/conversationService.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function listConversationsHandler(req: Request, res: Response): Promise<void> {
  const archived = req.query.archived === "true";
  const limit = Number(req.query.limit);
  const conversations = await listConversations(requireUserId(req), {
    archived,
    ...(Number.isFinite(limit) ? { limit } : {}),
  });
  res.status(200).json({ conversations });
}

export async function createConversationHandler(req: Request, res: Response): Promise<void> {
  const body = createConversationSchema.parse(req.body);
  const conversation = await createConversation(requireUserId(req), body);
  res.status(201).json({ conversation });
}

export async function getConversationHandler(req: Request, res: Response): Promise<void> {
  const conversation = await getConversation(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ conversation });
}

export async function updateConversationHandler(req: Request, res: Response): Promise<void> {
  const body = patchConversationSchema.parse(req.body);
  const conversation = await updateConversation(requireUserId(req), req.params.id ?? "", body);
  res.status(200).json({ conversation });
}

export async function deleteConversationHandler(req: Request, res: Response): Promise<void> {
  await deleteConversation(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ ok: true });
}

export async function listMessagesHandler(req: Request, res: Response): Promise<void> {
  const limit = Number(req.query.limit);
  const messages = await listMessages(requireUserId(req), req.params.id ?? "", {
    ...(Number.isFinite(limit) ? { limit } : {}),
    ...(typeof req.query.before === "string" ? { before: req.query.before } : {}),
    includeSuperseded: req.query.includeSuperseded === "true",
  });
  res.status(200).json({ messages });
}

export async function sendConversationMessageHandler(req: Request, res: Response): Promise<void> {
  const body = sendMessageSchema.parse(req.body);
  const userId = requireUserId(req);
  const prepared = await prepareSend({
    userId,
    content: body.content,
    ...(req.params.id ? { conversationId: req.params.id } : {}),
    ...(body.providerId ? { providerId: body.providerId } : {}),
    ...(body.modelId ? { modelId: body.modelId } : {}),
    ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
    ...(body.enabledTools ? { enabledTools: body.enabledTools } : {}),
    ...(body.customGptId ? { customGptId: body.customGptId } : {}),
  });
  await streamPrepared(req, res, prepared, "POST /conversations/:id/messages");
}

export async function sendChatHandler(req: Request, res: Response): Promise<void> {
  const body = sendMessageSchema.parse(req.body);
  const userId = requireUserId(req);
  const prepared = await prepareSend({
    userId,
    content: body.content,
    ...(body.conversationId ? { conversationId: body.conversationId } : {}),
    ...(body.providerId ? { providerId: body.providerId } : {}),
    ...(body.modelId ? { modelId: body.modelId } : {}),
    ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
    ...(body.enabledTools ? { enabledTools: body.enabledTools } : {}),
    ...(body.customGptId ? { customGptId: body.customGptId } : {}),
  });
  await streamPrepared(req, res, prepared, "POST /chat");
}

export async function regenerateHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const prepared = await prepareRegenerate({
    userId,
    conversationId: req.params.id ?? "",
    messageId: req.params.messageId ?? "",
  });
  await streamPrepared(req, res, prepared, "POST /conversations/:id/messages/:messageId/regenerate");
}

export async function abortHandler(req: Request, res: Response): Promise<void> {
  const body = abortGenerationSchema.parse(req.body ?? {});
  const userId = requireUserId(req);
  const conversationId = req.params.id ?? body.conversationId ?? "";
  if (!conversationId && !body.generationId) {
    throw new AppError("No active generation", { statusCode: 404, code: "GENERATION_NOT_FOUND" });
  }
  const aborted = abortGeneration(userId, conversationId, body.generationId);
  res.status(200).json({ ok: true, aborted });
}

export async function feedbackHandler(req: Request, res: Response): Promise<void> {
  const body = messageFeedbackSchema.parse(req.body);
  const message = await setMessageFeedback(
    requireUserId(req),
    req.params.id ?? "",
    req.params.messageId ?? "",
    {
      rating: body.rating,
      ...(body.comment ? { comment: body.comment } : {}),
    },
  );
  res.status(200).json({ message });
}

async function streamPrepared(
  req: Request,
  res: Response,
  prepared: Awaited<ReturnType<typeof prepareSend>>,
  route: string,
): Promise<void> {
  writeSseHeaders(res);
  const onClose = (): void => {
    if (!res.writableEnded) {
      abortGeneration(prepared.userId, prepared.conversationId, prepared.generationId);
    }
  };
  req.on("close", onClose);
  try {
    await runGeneration(
      prepared,
      (event) => {
        if (!res.writableEnded) writeSseEvent(res, event.type, event);
      },
      route,
    );
  } finally {
    req.off("close", onClose);
    if (!res.writableEnded) res.end();
  }
}
