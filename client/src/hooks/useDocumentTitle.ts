import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { APP_NAME } from "@Ken/shared";

function titleForPath(pathname: string): string {
  if (pathname === "/") return APP_NAME;
  if (pathname.startsWith("/login")) return `Sign in · ${APP_NAME}`;
  if (pathname.startsWith("/register")) return `Create account · ${APP_NAME}`;
  if (pathname.startsWith("/forgot-password")) return `Forgot password · ${APP_NAME}`;
  if (pathname.startsWith("/reset-password")) return `Reset password · ${APP_NAME}`;
  if (pathname.startsWith("/verify-email")) return `Verify email · ${APP_NAME}`;
  if (pathname.startsWith("/chat")) return `Chat · ${APP_NAME}`;
  if (pathname.startsWith("/search") || pathname.startsWith("/history")) return `History · ${APP_NAME}`;
  if (pathname.startsWith("/library")) return `Library · ${APP_NAME}`;
  if (pathname.startsWith("/gpts/create")) return `Create GPT · ${APP_NAME}`;
  if (pathname.startsWith("/gpts/")) return `GPT · ${APP_NAME}`;
  if (pathname.startsWith("/gpts")) return `GPTs · ${APP_NAME}`;
  if (pathname.startsWith("/settings")) return `Settings · ${APP_NAME}`;
  if (pathname.startsWith("/admin")) return `Admin · ${APP_NAME}`;
  if (pathname.startsWith("/share")) return `Shared chat · ${APP_NAME}`;
  return APP_NAME;
}

export function useDocumentTitle(): void {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = titleForPath(pathname);
  }, [pathname]);
}
