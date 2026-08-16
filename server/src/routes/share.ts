import { Router } from "express";
import { getPublicShareHandler } from "../controllers/shareController.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const shareRouter = Router();

shareRouter.get("/:token", asyncHandler(getPublicShareHandler));
