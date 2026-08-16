import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/services/api";

function googleErrorMessage(code: string | null): string {
  if (code === "google_cancelled") return "Google sign-in was cancelled.";
  if (code === "google_invalid") return "Google sign-in failed. Try again.";
  if (code === "google_not_configured") return "Google sign-in is not configured on the server.";
  return "";
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(googleErrorMessage(params.get("error")));
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await login(email, password);
      void navigate(CLIENT_ROUTES.chat);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-fg-muted">Use your email and password, or continue with Google.</p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <form className="space-y-3" onSubmit={onSubmit} aria-label="Sign in">
        <label className="block text-sm">
          Email
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <a
        href={api.auth.googleStartUrl}
        className="block w-full rounded-lg border border-border px-4 py-2 text-center text-sm"
      >
        Continue with Google
      </a>
      <p className="text-sm text-fg-muted">
        <Link to={CLIENT_ROUTES.forgotPassword} className="text-accent underline-offset-4 hover:underline">
          Forgot password
        </Link>
        {" · "}
        <Link to={CLIENT_ROUTES.register} className="text-accent underline-offset-4 hover:underline">
          Create account
        </Link>
      </p>
    </div>
  );
}
