import { Outlet } from "react-router-dom";
import { Toaster } from "@/components/Toaster";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function AppShell() {
  useDocumentTitle();

  return (
    <div className="min-h-svh bg-canvas text-fg">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Outlet />
      <Toaster />
    </div>
  );
}
