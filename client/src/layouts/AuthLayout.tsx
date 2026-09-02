import { Suspense } from "react";
import { Link, Outlet } from "react-router-dom";
import { APP_NAME, CLIENT_ROUTES } from "@Ken/shared";
import { KenMark } from "@/components/KenMark";
import { PageFallback } from "@/components/PageFallback";

export function AuthLayout() {
  return (
    <div className="auth-shell relative flex min-h-svh items-center justify-center bg-canvas px-4 py-10">
      <div className="auth-grain" aria-hidden="true" />
      <div className="auth-vignette" aria-hidden="true" />
      <main id="main-content" tabIndex={-1} className="auth-main relative z-10 w-full max-w-md space-y-5 outline-none">
        <Link
          to={CLIENT_ROUTES.home}
          className="auth-brand flex justify-center"
          aria-label={`${APP_NAME} home`}
        >
          <KenMark withWordmark className="h-9 w-9" />
        </Link>
        <div className="auth-glass rounded-[14px] border p-8">
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
