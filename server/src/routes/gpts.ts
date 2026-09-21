import { Router } from "express";
import { listGptsQuerySchema } from "@Ken/shared";
import {
  createGptHandler,
  deleteGptHandler,
  getGptHandler,
  listGptsHandler,
  updateGptHandler,
} from "../controllers/gptController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { validateQuery } from "../validators/validate.js";

export const gptsRouter = Router();

gptsRouter.use(requireAuth);
gptsRouter.get("/", validateQuery(listGptsQuerySchema), asyncHandler(listGptsHandler));
gptsRouter.post("/", asyncHandler(createGptHandler));
gptsRouter.get("/:id", asyncHandler(getGptHandler));
gptsRouter.patch("/:id", asyncHandler(updateGptHandler));
gptsRouter.delete("/:id", asyncHandler(deleteGptHandler));
