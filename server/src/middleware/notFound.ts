import type { Request, Response } from "express";
import { AppError } from "../utils/AppError.js";

export function notFoundHandler(req: Request, _res: Response): void {
  throw new AppError(`Route not found: ${req.method} ${req.originalUrl}`, {
    statusCode: 404,
    code: "NOT_FOUND",
  });
}
