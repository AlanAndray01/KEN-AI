import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("x-request-id");
  const id = header && header.trim().length > 0 ? header.trim() : randomUUID();
  req.requestId = id;
  res.setHeader("x-request-id", id);
  next();
}
