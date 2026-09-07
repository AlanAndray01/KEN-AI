import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CLIENT_ROUTES } from "@Ken/shared";

const OTP_PATHS: ReadonlySet<string> = new Set([
  CLIENT_ROUTES.verifyEmail,
  CLIENT_ROUTES.forgotPassword,
  CLIENT_ROUTES.resetPassword,
]);

export function GuestRoute() {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-fg-muted" role="status">
        Loading
      </div>
    );
  }

  // Login/register bounce signed-in users to chat. Verify/reset must stay
  // reachable so a stale cache cannot loop them away from the OTP screen.
  if (user && !OTP_PATHS.has(location.pathname)) {
    return <Navigate to={CLIENT_ROUTES.chat} replace />;
  }

  return <Outlet />;
}
