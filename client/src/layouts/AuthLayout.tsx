import { Link, Outlet } from "react-router-dom";
import { APP_NAME, CLIENT_ROUTES } from "@aether/shared";
import { ThemeToggle } from "@/components/ThemeToggle";

export function AuthLayout() {
  return (
    <div className="relative flex min-h-svh items-center justify-center bg-canvas px-4 py-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle compact />
      </div>
      <main id="main-content" tabIndex={-1} className="w-full max-w-md space-y-6 outline-none">
        <Link to={CLIENT_ROUTES.home} className="block text-center text-lg font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
