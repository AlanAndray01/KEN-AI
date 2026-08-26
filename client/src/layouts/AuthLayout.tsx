import { Suspense } from "react";
import { Link, Outlet } from "react-router-dom";
import { APP_NAME, CLIENT_ROUTES } from "@aether/shared";
import { PageFallback } from "@/components/PageFallback";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AuthLayout() {
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-canvas px-4 py-10">
      <div className="absolute right-4 top-4">
        <ThemeToggle compact />
      </div>
      <main id="main-content" tabIndex={-1} className="relative z-10 w-full max-w-md space-y-5 outline-none">
        <Link to={CLIENT_ROUTES.home} className="block text-center text-lg font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        <div className="auth-glass rounded-2xl border border-border p-8">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
