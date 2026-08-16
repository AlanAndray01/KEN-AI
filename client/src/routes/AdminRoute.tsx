import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CLIENT_ROUTES } from "@aether/shared";

export function AdminRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-fg-muted" role="status">
        Loading
      </div>
    );
  }

  if (!user) {
    return <Navigate to={CLIENT_ROUTES.login} replace />;
  }

  if (user.role !== "admin") {
    return <Navigate to={CLIENT_ROUTES.chat} replace />;
  }

  return <Outlet />;
}
