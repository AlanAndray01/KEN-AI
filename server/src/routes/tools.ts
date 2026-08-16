import { Router } from "express";
import {
  generateImageHandler,
  listToolsHandler,
  searchHandler,
} from "../controllers/toolsController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimitImage, rateLimitSearch } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const toolsRouter = Router();

toolsRouter.use(requireAuth);
toolsRouter.get("/", asyncHandler(listToolsHandler));
toolsRouter.post("/search", rateLimitSearch, asyncHandler(searchHandler));
toolsRouter.post("/images", rateLimitImage, asyncHandler(generateImageHandler));
