import { Router } from "express";
import { imageGenerationSchema, listToolsQuerySchema } from "@Ken/shared";
import {
  generateImageHandler,
  listToolsHandler,
  searchHandler,
} from "../controllers/toolsController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimitImage, rateLimitSearch } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateBody, validateQuery } from "../validators/validate.js";

export const toolsRouter = Router();

toolsRouter.use(requireAuth);
toolsRouter.get("/", validateQuery(listToolsQuerySchema), asyncHandler(listToolsHandler));
toolsRouter.post("/search", rateLimitSearch, asyncHandler(searchHandler));
toolsRouter.post("/images", rateLimitImage, validateBody(imageGenerationSchema), asyncHandler(generateImageHandler));
