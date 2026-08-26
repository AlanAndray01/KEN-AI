import { Outlet } from "react-router-dom";
import { Suspense } from "react";
import { Toaster } from "@/components/Toaster";
import { PageFallback } from "@/components/PageFallback";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

export function AppShell() {
  useDocumentTitle();

  return (
    <div className="min-h-svh bg-canvas text-fg">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <Suspense fallback={<PageFallback />}>
        <Outlet />
      </Suspense>
      <Toaster />
    </div>
  );
}
