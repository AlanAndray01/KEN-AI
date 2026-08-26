import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import { isProduction } from "../config/env.js";
import { logger } from "../config/logger.js";
import { AppError } from "../utils/AppError.js";
import { redactSensitive, toSafeError } from "../utils/redact.js";

function isPayloadTooLarge(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "type" in err &&
      (err as { type?: string }).type === "entity.too.large",
  );
}

function validationDetails(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) {
    return err;
  }
  if (err instanceof ZodError) {
    return new AppError(err.issues[0]?.message ?? "Invalid request", {
      statusCode: 400,
      code: "VALIDATION_ERROR",
      details: validationDetails(err),
    });
  }
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return new AppError("File is too large", { statusCode: 413, code: "FILE_TOO_LARGE" });
    }
    return new AppError("Upload failed", { statusCode: 400, code: "UPLOAD_FAILED" });
  }
  if (isPayloadTooLarge(err)) {
    return new AppError("Request body is too large", { statusCode: 413, code: "PAYLOAD_TOO_LARGE" });
  }
  return new AppError("An unexpected error occurred", {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    cause: err,
  });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const error = toAppError(err);
  const safeMessage = redactSensitive(error.message);
  const safeCause = toSafeError(error.cause ?? err);

  logger.error(
    {
      requestId: req.requestId,
      method: req.method,
      route: req.path,
      status: error.statusCode,
      code: error.code,
      err: {
        name: safeCause.name,
        message: redactSensitive(safeCause.message),
      },
    },
    safeMessage,
  );

  const payload: {
    error: {
      code: string;
      message: string;
      requestId?: string;
      details?: unknown;
    };
    [key: string]: unknown;
  } = {
    error: {
      code: error.code,
      message: error.expose || !isProduction ? safeMessage : "An unexpected error occurred",
    },
  };

  if (req.requestId) {
    payload.error.requestId = req.requestId;
  }

  if (error.details !== undefined && (!isProduction || error.code === "VALIDATION_ERROR")) {
    try {
      payload.error.details = JSON.parse(redactSensitive(JSON.stringify(error.details))) as unknown;
    } catch {
      payload.error.details = error.details;
    }
  }

  if (error.extra) {
    for (const [key, value] of Object.entries(error.extra)) {
      if (key !== "error") {
        payload[key] = value;
      }
    }
  }

  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }

  res.status(error.statusCode).json(payload);
}
