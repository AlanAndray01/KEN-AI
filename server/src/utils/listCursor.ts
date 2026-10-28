import mongoose from "mongoose";
import { AppError } from "./AppError.js";

export function encodeListCursor(row: { id: string; date: string; pinned?: boolean }): string {
  return Buffer.from(JSON.stringify(row)).toString("base64url");
}

export function decodeListCursor(value: string): { id: mongoose.Types.ObjectId; date: Date; pinned: boolean } {
  try {
    if (value.length > 512) throw new Error();
    const row = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof row.id !== "string" || !mongoose.isValidObjectId(row.id) || typeof row.date !== "string"
      || (row.pinned !== undefined && typeof row.pinned !== "boolean")) throw new Error();
    const date = new Date(row.date);
    if (!Number.isFinite(date.getTime())) throw new Error();
    return { id: new mongoose.Types.ObjectId(row.id), date, pinned: row.pinned === true };
  } catch {
    throw new AppError("Invalid list cursor", { statusCode: 400, code: "INVALID_CURSOR" });
  }
}
