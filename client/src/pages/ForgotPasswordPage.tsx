import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { AuthField } from "@/components/AuthField";
import { AuthModeNav } from "@/components/AuthModeNav";
import { ApiError, api } from "@/services/api";

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      await api.auth.forgotPassword({ email });
      void navigate(`${CLIENT_ROUTES.resetPassword}?email=${encodeURIComponent(email.trim().toLowerCase())}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to send reset instructions");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-stack">
      <AuthModeNav />
      <div className="space-y-1 text-center">
        <h1 className="text-2xl tracking-tight">Forgot password</h1>
        <p className="text-sm text-fg-muted">
          If that email exists, we create a 6-digit code that expires in 15 minutes. Check your inbox, or the API
          terminal for <code className="font-mono text-fg">[DEV AUTH CODE]</code> in development.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <form className="space-y-3" onSubmit={onSubmit} aria-label="Forgot password">
        <AuthField
          label="Email address"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <button
          type="submit"
          disabled={pending}
          className="auth-submit"
        >
          {pending ? "Sending…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
