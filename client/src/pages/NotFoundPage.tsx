import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";

export function NotFoundPage() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6 outline-none">
      <p className="text-sm text-fg-muted">404</p>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <p className="text-fg-muted">That route does not exist in Ken.</p>
      <Link to={CLIENT_ROUTES.home} className="text-sm text-accent underline-offset-4 hover:underline">
        Go home
      </Link>
    </main>
  );
}
