import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { ApiError, api } from "@/services/api";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await api.auth.forgotPassword({ email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send reset instructions");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Forgot password</h1>
        <p className="text-sm text-fg-muted">
          If that email exists, we will issue a reset link. Email delivery is skipped until SMTP is
          configured.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {sent ? (
        <p className="text-sm">If an account exists for that email, reset instructions were created.</p>
      ) : (
        <form className="space-y-3" onSubmit={onSubmit} aria-label="Forgot password">
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
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {pending ? "Sending…" : "Send reset instructions"}
          </button>
        </form>
      )}
      <Link to={CLIENT_ROUTES.login} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
