import { env } from "../../config/env.js";

export function refreshExpiryDate(from = new Date()): Date {
  return new Date(from.getTime() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));
}

export function parseDurationMs(value: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(value.trim());
  if (!match) {
    return 7 * 24 * 60 * 60 * 1000;
  }

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === "s") return amount * 1000;
  if (unit === "m") return amount * 60 * 1000;
  if (unit === "h") return amount * 60 * 60 * 1000;
  return amount * 24 * 60 * 60 * 1000;
}
