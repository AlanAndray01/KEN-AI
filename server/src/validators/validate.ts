import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../utils/AppError.js";

export function validateBody<T>(schema: ZodType<T>) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      next(validationError(parsed.error));
      return;
    }

    req.body = parsed.data;
    next();
  };
}

function validationError(error: ZodError): AppError {
  return new AppError("Invalid request", {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    details: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}
