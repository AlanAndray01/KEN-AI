import type { Request, Response } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import {
  deleteOwnedFile,
  listUserFiles,
  readOwnedFile,
  uploadUserFile,
} from "../services/storage/fileService.js";

export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FILE_MAX_BYTES, files: 1 },
}).single("file");

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function uploadFileHandler(req: Request, res: Response): Promise<void> {
  const uploaded = req.file;
  if (!uploaded) {
    throw new AppError("File is required", { statusCode: 400, code: "FILE_REQUIRED" });
  }
  const file = await uploadUserFile({
    userId: requireUserId(req),
    originalName: uploaded.originalname || "upload",
    mimeType: uploaded.mimetype || "application/octet-stream",
    buffer: uploaded.buffer,
  });
  res.status(201).json({ file });
}

export async function listFilesHandler(req: Request, res: Response): Promise<void> {
  const files = await listUserFiles(requireUserId(req));
  res.status(200).json({ files });
}

export async function getFileHandler(req: Request, res: Response): Promise<void> {
  const { file } = await readOwnedFile(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ file });
}

export async function getFileContentHandler(req: Request, res: Response): Promise<void> {
  const { file, buffer } = await readOwnedFile(requireUserId(req), req.params.id ?? "");
  res.setHeader("Content-Type", file.mimeType);
  res.setHeader("Content-Length", String(buffer.length));
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalName)}"`);
  res.status(200).send(buffer);
}

export async function deleteFileHandler(req: Request, res: Response): Promise<void> {
  await deleteOwnedFile(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ ok: true });
}
