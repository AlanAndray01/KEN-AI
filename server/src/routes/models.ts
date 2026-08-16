import { Router } from "express";
import { listModels } from "../controllers/providerController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const modelsRouter = Router();

modelsRouter.get("/", requireAuth, asyncHandler(listModels));
