import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { ApiError, api } from "@/services/api";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [error, setError] = useState(token ? "" : "This reset link is missing a token.");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) {
      return;
    }
    setError("");
    setPending(true);
    try {
      await api.auth.resetPassword({ token, password });
      void navigate(CLIENT_ROUTES.login);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reset password");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Reset password</h1>
        <p className="text-sm text-fg-muted">Choose a new password for your Aether account.</p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <form className="space-y-3" onSubmit={onSubmit} aria-label="Reset password">
        <label className="block text-sm">
          New password
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            disabled={!token}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pending || !token}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
      <Link to={CLIENT_ROUTES.login} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
