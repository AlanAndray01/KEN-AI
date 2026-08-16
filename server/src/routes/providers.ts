import { Router } from "express";
import { listProviders } from "../controllers/providerController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const providersRouter = Router();

providersRouter.get("/", requireAuth, asyncHandler(listProviders));
