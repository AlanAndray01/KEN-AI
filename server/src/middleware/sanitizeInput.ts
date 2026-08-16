import type { NextFunction, Request, Response } from "express";

export function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/\0/g, "").normalize("NFC");
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (key.startsWith("$") || key.includes(".")) continue;
      output[key] = sanitizeValue(nested);
    }
    return output;
  }
  return value;
}

export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === "object") {
    const cleaned = sanitizeValue(req.query);
    if (cleaned && typeof cleaned === "object") {
      for (const key of Object.keys(req.query)) {
        delete (req.query as Record<string, unknown>)[key];
      }
      Object.assign(req.query, cleaned);
    }
  }
  if (req.params && typeof req.params === "object") {
    const cleaned = sanitizeValue(req.params);
    if (cleaned && typeof cleaned === "object") {
      for (const key of Object.keys(req.params)) {
        delete (req.params as Record<string, unknown>)[key];
      }
      Object.assign(req.params, cleaned);
    }
  }
  next();
}
