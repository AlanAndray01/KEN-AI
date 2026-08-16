import { Router } from "express";
import {
  audioUploadMiddleware,
  speakHandler,
  transcribeHandler,
  voiceStatusHandler,
} from "../controllers/voiceController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimitVoice } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const voiceRouter = Router();

voiceRouter.use(requireAuth);
voiceRouter.get("/status", asyncHandler(voiceStatusHandler));
voiceRouter.post("/transcribe", rateLimitVoice, audioUploadMiddleware, asyncHandler(transcribeHandler));
voiceRouter.post("/speak", rateLimitVoice, asyncHandler(speakHandler));
