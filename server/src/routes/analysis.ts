import { Router } from "express";
import { createAnalysisJobHandler, getAnalysisJobHandler } from "../controllers/toolsController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimitChat } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const analysisRouter = Router();

analysisRouter.use(requireAuth);
analysisRouter.post("/jobs", rateLimitChat, asyncHandler(createAnalysisJobHandler));
analysisRouter.get("/jobs/:id", asyncHandler(getAnalysisJobHandler));
