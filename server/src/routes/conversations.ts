import { Router } from "express";
import {
  abortHandler,
  createConversationHandler,
  deleteConversationHandler,
  feedbackHandler,
  getConversationHandler,
  listConversationsHandler,
  listMessagesHandler,
  regenerateHandler,
  sendConversationMessageHandler,
  updateConversationHandler,
} from "../controllers/chatController.js";
import { exportConversationHandler } from "../controllers/exportController.js";
import {
  createConversationShareHandler,
  getConversationShareHandler,
  revokeConversationShareHandler,
} from "../controllers/shareController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimitChat } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const conversationsRouter = Router();

conversationsRouter.use(requireAuth);
conversationsRouter.get("/", asyncHandler(listConversationsHandler));
conversationsRouter.post("/", asyncHandler(createConversationHandler));
conversationsRouter.get("/:id", asyncHandler(getConversationHandler));
conversationsRouter.patch("/:id", asyncHandler(updateConversationHandler));
conversationsRouter.delete("/:id", asyncHandler(deleteConversationHandler));
conversationsRouter.get("/:id/messages", asyncHandler(listMessagesHandler));
conversationsRouter.post("/:id/messages", rateLimitChat, asyncHandler(sendConversationMessageHandler));
conversationsRouter.post("/:id/messages/:messageId/regenerate", rateLimitChat, asyncHandler(regenerateHandler));
conversationsRouter.post("/:id/messages/:messageId/feedback", asyncHandler(feedbackHandler));
conversationsRouter.post("/:id/generation/abort", asyncHandler(abortHandler));
conversationsRouter.get("/:id/share", asyncHandler(getConversationShareHandler));
conversationsRouter.post("/:id/share", asyncHandler(createConversationShareHandler));
conversationsRouter.delete("/:id/share", asyncHandler(revokeConversationShareHandler));
conversationsRouter.get("/:id/export", asyncHandler(exportConversationHandler));
