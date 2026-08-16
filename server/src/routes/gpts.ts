import { Router } from "express";
import {
  createGptHandler,
  deleteGptHandler,
  getGptHandler,
  listGptsHandler,
  updateGptHandler,
} from "../controllers/gptController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const gptsRouter = Router();

gptsRouter.use(requireAuth);
gptsRouter.get("/", asyncHandler(listGptsHandler));
gptsRouter.post("/", asyncHandler(createGptHandler));
gptsRouter.get("/:id", asyncHandler(getGptHandler));
gptsRouter.patch("/:id", asyncHandler(updateGptHandler));
gptsRouter.delete("/:id", asyncHandler(deleteGptHandler));
