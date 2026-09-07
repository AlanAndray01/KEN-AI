import { AppError } from "../../utils/AppError.js";

/**
 * Serve a real document before leaving for Google. An immediate 302 from
 * /api/auth/google is a bounce, and Safari / Chrome drop the state cookie.
 */
export function googleHandoffHtml(authorizeUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(authorizeUrl);
  } catch {
    throw new AppError("Invalid Google authorization URL", {
      statusCode: 500,
      code: "GOOGLE_INVALID",
      expose: false,
    });
  }

  if (parsed.protocol !== "https:" || parsed.hostname !== "accounts.google.com") {
    throw new AppError("Invalid Google authorization URL", {
      statusCode: 500,
      code: "GOOGLE_INVALID",
      expose: false,
    });
  }

  const href = authorizeUrl
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
    .replaceAll("<", "&lt;");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="robots" content="noindex">
    <meta http-equiv="refresh" content="0;url=${href}">
    <title>Continue to Google</title>
  </head>
  <body>
    <p>Redirecting to Google to sign in…</p>
    <p><a href="${href}">Continue</a></p>
    <script>location.replace(${JSON.stringify(authorizeUrl)})</script>
  </body>
</html>`;
}
