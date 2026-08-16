import { Router } from "express";
import {
  createMemoryHandler,
  deleteMemoryHandler,
  listMemoriesHandler,
  updateMemoryHandler,
} from "../controllers/memoryController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const memoriesRouter = Router();

memoriesRouter.use(requireAuth);
memoriesRouter.get("/", asyncHandler(listMemoriesHandler));
memoriesRouter.post("/", asyncHandler(createMemoryHandler));
memoriesRouter.patch("/:id", asyncHandler(updateMemoryHandler));
memoriesRouter.delete("/:id", asyncHandler(deleteMemoryHandler));
