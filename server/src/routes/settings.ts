import { Router } from "express";
import { saveSettingsKey } from "../controllers/providerController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const settingsRouter = Router();

settingsRouter.use(requireAuth);
settingsRouter.post("/keys", asyncHandler(saveSettingsKey));
