import { Router } from "express";
import { abortHandler, sendChatHandler } from "../controllers/chatController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimitChat } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const chatRouter = Router();

chatRouter.use(requireAuth);
chatRouter.post("/", rateLimitChat, asyncHandler(sendChatHandler));
chatRouter.post("/abort", asyncHandler(abortHandler));
