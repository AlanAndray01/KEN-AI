import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { APP_NAME, CLIENT_ROUTES } from "@aether/shared";
import { api } from "@/services/api";

export function HomePage() {
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health.get(),
    retry: false,
  });

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16 outline-none">
      <div className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">{APP_NAME}</p>
        <h1 className="text-4xl font-semibold tracking-tight">A private AI workspace.</h1>
        <p className="max-w-xl text-fg-muted">
          Aether is a MERN assistant platform. Sign in to chat with configured AI providers.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          to={CLIENT_ROUTES.login}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
          Sign in
        </Link>
        <Link
          to={CLIENT_ROUTES.register}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium"
        >
          Create account
        </Link>
      </div>

      <section
        aria-label="API health"
        className="rounded-xl border border-border bg-surface px-4 py-3 text-sm"
      >
        {healthQuery.isLoading && <p className="text-fg-muted">Checking API…</p>}
        {healthQuery.isError && (
          <p className="text-danger">
            API unreachable. Start the server with `npm run dev` from the repo root.
          </p>
        )}
        {healthQuery.data && (
          <p>
            API {healthQuery.data.status} · {healthQuery.data.service} · database{" "}
            {healthQuery.data.database.status}
          </p>
        )}
      </section>
    </main>
  );
}
