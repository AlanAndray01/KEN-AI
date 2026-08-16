import type { Request, Response } from "express";
import multer from "multer";
import { speakSchema } from "@aether/shared";
import { env } from "../config/env.js";
import { voiceService } from "../services/voice/index.js";
import { AppError } from "../utils/AppError.js";

export const audioUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.FILE_MAX_BYTES, files: 1 },
}).single("audio");

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function voiceStatusHandler(req: Request, res: Response): Promise<void> {
  requireUserId(req);
  const sttConfigured = voiceService.sttConfigured();
  const ttsConfigured = voiceService.ttsConfigured();
  res.status(200).json({
    ...(voiceService.id !== "none" ? { provider: voiceService.id } : {}),
    sttConfigured,
    ttsConfigured,
    message:
      sttConfigured || ttsConfigured
        ? "Speech-to-text and text-to-speech are available. Realtime voice is not enabled."
        : voiceService.unavailableReason(),
  });
}

export async function transcribeHandler(req: Request, res: Response): Promise<void> {
  requireUserId(req);
  const uploaded = req.file;
  if (!uploaded) {
    throw new AppError("Audio is required", { statusCode: 400, code: "AUDIO_REQUIRED" });
  }
  const result = await voiceService.transcribe({
    buffer: uploaded.buffer,
    mimeType: uploaded.mimetype || "audio/webm",
    filename: uploaded.originalname || "audio.webm",
  });
  res.status(200).json({ text: result.text });
}

export async function speakHandler(req: Request, res: Response): Promise<void> {
  requireUserId(req);
  const body = speakSchema.parse(req.body);
  const result = await voiceService.speak(body.text);
  res.setHeader("Content-Type", result.mimeType);
  res.setHeader("Content-Length", String(result.buffer.length));
  res.status(200).send(result.buffer);
}
