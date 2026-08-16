import { logger } from "../../config/logger.js";

export async function sendPasswordResetEmail(_userId: string, _resetUrl: string): Promise<boolean> {
  logger.info({ passwordReset: "email_not_configured" }, "Password reset email skipped");
  return false;
}
