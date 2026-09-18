import type { Request, Response } from "express";
import {
  abortGenerationSchema,
  createConversationSchema,
  editMessageSchema,
  messageFeedbackSchema,
  patchConversationSchema,
  regenerateMessageSchema,
  sendMessageSchema,
} from "@Ken/shared";
import { AppError } from "../utils/AppError.js";
import { startSseHeartbeat, writeSseDone, writeSseEvent, writeSseHeaders } from "../utils/sse.js";
import {
  abortGeneration,
  loadHistory,
  prepareEdit,
  prepareRegenerate,
  prepareSend,
  runGeneration,
} from "../services/chat/chatService.js";
import { buildPersonaMessages } from "../services/memory/persona.js";
import { isTrivialTurn } from "../services/chat/responsePolicy.js";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  setMessageFeedback,
  updateConversation,
} from "../services/chat/conversationService.js";

function contextHint(
  userId: string,
  content: string,
  extra?: { conversationId?: string; customGptId?: string; attachmentIds?: string[]; enabledTools?: unknown[] },
): { userId: string; conversationId?: string; customGptId?: string } | undefined {
  if (
    isTrivialTurn(content) &&
    !(extra?.attachmentIds && extra.attachmentIds.length > 0) &&
    !(extra?.enabledTools && extra.enabledTools.length > 0) &&
    !extra?.customGptId
  ) {
    return undefined;
  }
  return {
    userId,
    ...(extra?.conversationId ? { conversationId: extra.conversationId } : {}),
    ...(extra?.customGptId ? { customGptId: extra.customGptId } : {}),
  };
}

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
  await streamFromPrepare(
    req,
    res,
    () =>
      prepareSend({
        userId,
        content: body.content,
        ...(req.params.id ? { conversationId: req.params.id } : {}),
        ...(body.providerId ? { providerId: body.providerId } : {}),
        ...(body.modelId ? { modelId: body.modelId } : {}),
        ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
        ...(body.enabledTools ? { enabledTools: body.enabledTools } : {}),
        ...(body.customGptId ? { customGptId: body.customGptId } : {}),
      }),
    "POST /conversations/:id/messages",
    contextHint(userId, body.content, {
      ...(req.params.id ? { conversationId: req.params.id } : {}),
      ...(body.customGptId ? { customGptId: body.customGptId } : {}),
      ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
      ...(body.enabledTools ? { enabledTools: body.enabledTools } : {}),
    }),
  );
}

export async function sendChatHandler(req: Request, res: Response): Promise<void> {
  const body = sendMessageSchema.parse(req.body);
  const userId = requireUserId(req);
  await streamFromPrepare(
    req,
    res,
    () =>
      prepareSend({
        userId,
        content: body.content,
        ...(body.conversationId ? { conversationId: body.conversationId } : {}),
        ...(body.providerId ? { providerId: body.providerId } : {}),
        ...(body.modelId ? { modelId: body.modelId } : {}),
        ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
        ...(body.enabledTools ? { enabledTools: body.enabledTools } : {}),
        ...(body.customGptId ? { customGptId: body.customGptId } : {}),
      }),
    "POST /chat",
    contextHint(userId, body.content, {
      ...(body.conversationId ? { conversationId: body.conversationId } : {}),
      ...(body.customGptId ? { customGptId: body.customGptId } : {}),
      ...(body.attachmentIds ? { attachmentIds: body.attachmentIds } : {}),
      ...(body.enabledTools ? { enabledTools: body.enabledTools } : {}),
    }),
  );
}

export async function regenerateHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const body = regenerateMessageSchema.parse(req.body ?? {});
  await streamFromPrepare(
    req,
    res,
    () =>
      prepareRegenerate({
        userId,
        conversationId: req.params.id ?? "",
        messageId: req.params.messageId ?? "",
        ...(body.providerId ? { providerId: body.providerId } : {}),
        ...(body.modelId ? { modelId: body.modelId } : {}),
      }),
    "POST /conversations/:id/messages/:messageId/regenerate",
    {
      userId,
      conversationId: req.params.id ?? "",
    },
  );
}

export async function editMessageHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const body = editMessageSchema.parse(req.body ?? {});
  await streamFromPrepare(
    req,
    res,
    () =>
      prepareEdit({
        userId,
        conversationId: req.params.id ?? "",
        messageId: req.params.messageId ?? "",
        content: body.content,
        ...(body.providerId ? { providerId: body.providerId } : {}),
        ...(body.modelId ? { modelId: body.modelId } : {}),
      }),
    "POST /conversations/:id/messages/:messageId/edit",
    // Deliberately no preload hint. streamFromPrepare loads history in parallel
    // with prepare() as a latency optimisation, but prepareEdit appends the
    // reworded question as a new turn — a parallel read would finish first and
    // hand the model a history that is missing the question being asked.
  );
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

async function streamFromPrepare(
  req: Request,
  res: Response,
  prepare: () => Promise<Awaited<ReturnType<typeof prepareSend>>>,
  route: string,
  hint?: { userId: string; conversationId?: string; customGptId?: string },
): Promise<void> {
  const startedAt = Date.now();
  writeSseHeaders(res);
  const persistP = prepare();
  const contextP = (async () => {
    if (!hint) return undefined;
    const history = hint.conversationId ? await loadHistory(hint.userId, hint.conversationId) : [];
    const persona = await buildPersonaMessages(hint.userId, hint.customGptId);
    return [history, persona] as const;
  })().catch(() => undefined);

  let prepared: Awaited<ReturnType<typeof prepareSend>>;
  try {
    prepared = await persistP;
  } catch (error) {
    const failure = error instanceof AppError ? error : new AppError("Unable to start chat", { code: "INTERNAL_ERROR" });
    if (!res.writableEnded) {
      writeSseEvent(res, "error", {
        type: "error",
        message: failure.message,
        code: failure.code,
      });
      writeSseDone(res);
      res.end();
    }
    return;
  }

  const preloaded = await contextP;
  const onClose = (): void => {
    if (!res.writableEnded) {
      abortGeneration(prepared.userId, prepared.conversationId, prepared.generationId);
    }
  };
  req.on("close", onClose);
  // Started before the model is asked for anything: the silent window this
  // covers is the one before the first token, not the one between tokens.
  const stopHeartbeat = startSseHeartbeat(res);
  try {
    await runGeneration(
      prepared,
      (event) => {
        if (!res.writableEnded) writeSseEvent(res, event.type, event);
      },
      route,
      preloaded ? { history: preloaded[0], persona: preloaded[1] } : undefined,
      {
        startedAt,
        ...(req.requestId ? { requestId: req.requestId } : {}),
      },
    );
  } catch (error) {
    const failure = error instanceof AppError ? error : new AppError("Generation failed", { code: "PROVIDER_ERROR" });
    if (!res.writableEnded) {
      writeSseEvent(res, "error", {
        type: "error",
        message: failure.message,
        code: failure.code,
      });
    }
  } finally {
    stopHeartbeat();
    req.off("close", onClose);
    if (!res.writableEnded) {
      writeSseDone(res);
      res.end();
    }
  }
}
