import { Router } from "express";
import {
  deleteFileHandler,
  getFileContentHandler,
  getFileHandler,
  listFilesHandler,
  uploadFileHandler,
  uploadMiddleware,
} from "../controllers/fileController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { rateLimitUpload } from "../middleware/rateLimit.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const filesRouter = Router();

filesRouter.use(requireAuth);
filesRouter.get("/", asyncHandler(listFilesHandler));
filesRouter.post("/", rateLimitUpload, uploadMiddleware, asyncHandler(uploadFileHandler));
filesRouter.get("/:id/content", asyncHandler(getFileContentHandler));
filesRouter.get("/:id", asyncHandler(getFileHandler));
filesRouter.delete("/:id", asyncHandler(deleteFileHandler));
