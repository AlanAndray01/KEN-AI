import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { redactSensitive } from "../../utils/redact.js";

export const DEFAULT_DEV_FROM = "Ken <onboarding@resend.dev>";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function resolveFromAddress(): string | undefined {
  const from = env.EMAIL_FROM || env.RESEND_FROM_EMAIL;
  if (from) return from;
  if (env.NODE_ENV !== "production") return DEFAULT_DEV_FROM;
  return undefined;
}

export function isEmailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY && resolveFromAddress());
}

export function logDevAuthCode(kind: "verification" | "password_reset", to: string, secret: string): void {
  if (env.NODE_ENV !== "development") return;
  logger.info({ kind, to }, `[DEV AUTH CODE]: ${secret}`);
}

async function sendResendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html: string;
  skipLog: string;
  failLog: string;
}): Promise<boolean> {
  if (env.NODE_ENV === "test") {
    return false;
  }

  const from = resolveFromAddress();
  if (!env.RESEND_API_KEY || !from) {
    logger.info({ [input.skipLog]: "email_not_configured" }, `${input.failLog} skipped`);
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const raw = redactSensitive(await response.text());
      logger.warn(
        { [input.skipLog]: "email_failed", status: response.status, providerMessage: raw.slice(0, 500) },
        `${input.failLog} failed`,
      );
      return false;
    }

    logger.info({ [input.skipLog]: "email_sent" }, `${input.failLog} sent`);
    return true;
  } catch (error) {
    logger.warn(
      { [input.skipLog]: "email_failed", err: error instanceof Error ? redactSensitive(error.message) : "error" },
      `${input.failLog} failed`,
    );
    return false;
  }
}

export async function sendPasswordResetEmail(to: string, code: string): Promise<boolean> {
  logDevAuthCode("password_reset", to, code);
  const safeCode = escapeHtml(code);
  return sendResendEmail({
    to,
    subject: "Reset your Ken password",
    text: `Your Ken password reset code is ${code}. It expires in 15 minutes.\n`,
    html: `<p>Your password reset code is:</p><p style="font-size:28px;letter-spacing:0.28em;font-weight:700;text-align:center;">${safeCode}</p><p>It expires in 15 minutes. If you did not request this, you can ignore this email.</p>`,
    skipLog: "passwordReset",
    failLog: "Password reset email",
  });
}

export async function sendVerificationEmail(to: string, code: string): Promise<boolean> {
  logDevAuthCode("verification", to, code);
  if (env.NODE_ENV === "development") {
    console.log("🔑 VERIFICATION CODE FOR", to, ":", code);
  }
  const safeCode = escapeHtml(code);
  const html = `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 8px;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Ken</p>
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;">Verify your email</h1>
                <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46;">Use this 6-digit code to finish creating your account. It expires in 15 minutes.</p>
                <p style="margin:0 0 24px;font-size:32px;letter-spacing:0.28em;font-weight:700;text-align:center;">${safeCode}</p>
                <p style="margin:0;font-size:13px;line-height:1.5;color:#71717a;">If you did not create a Ken account, you can ignore this email.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendResendEmail({
    to,
    subject: "Your Ken verification code",
    text: `Your Ken verification code is ${code}. It expires in 15 minutes.\n`,
    html,
    skipLog: "emailVerification",
    failLog: "Verification email",
  });
}
