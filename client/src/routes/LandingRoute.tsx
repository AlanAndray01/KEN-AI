import { Navigate } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { useAuth } from "@/hooks/useAuth";

/**
 * Stands in for the landing page at `/` when VITE_SHOW_LANDING_PAGE is off.
 *
 * The session has to resolve before redirecting, otherwise a signed-in visitor
 * is bounced to the sign-in form for a frame before being sent back to chat.
 */
export function LandingRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-fg-muted" role="status">
        Loading
      </div>
    );
  }

  return <Navigate to={user ? CLIENT_ROUTES.chat : CLIENT_ROUTES.login} replace />;
}
