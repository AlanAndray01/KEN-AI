import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { AuthField } from "@/components/AuthField";
import { AuthModeNav } from "@/components/AuthModeNav";
import { GoogleMark } from "@/components/GoogleMark";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/services/api";
import { emailFieldTone, filledFieldTone } from "@/utils/authFieldTone";

function googleErrorMessage(code: string | null): string {
  if (code === "google_cancelled") return "Google sign-in was cancelled.";
  if (code === "google_invalid") return "Google sign-in failed. Try again.";
  if (code === "google_state") return "Google sign-in expired or was tampered with. Start again.";
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
      const result = await login(email, password);
      if (result?.requiresVerification) {
        void navigate(`${CLIENT_ROUTES.verifyEmail}?email=${encodeURIComponent(result.email)}`, {
          state: { emailSent: result.emailSent },
        });
        return;
      }
      void navigate(CLIENT_ROUTES.chat);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-stack">
      <AuthModeNav />
      <div className="space-y-1 text-center">
        <h1 className="text-2xl tracking-tight">Welcome back</h1>
        <p className="text-sm text-fg-muted">
          Log in or sign up to get smarter responses, upload files and images, and more.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <a
        href={api.auth.googleStartUrl}
        className="auth-google flex w-full items-center justify-center gap-3 rounded-[10px] border px-4 py-2.5 text-sm font-medium transition-colors"
      >
        <GoogleMark />
        Continue with Google
      </a>
      <div className="auth-or flex items-center gap-3 text-[11px] tracking-wide text-fg-muted uppercase">
        <span className="h-px flex-1" />
        or
        <span className="h-px flex-1" />
      </div>
      <form className="space-y-3" onSubmit={onSubmit} aria-label="Sign in">
        <AuthField
          label="Email address"
          type="email"
          autoComplete="email"
          required
          value={email}
          tone={emailFieldTone(email)}
          onChange={(event) => setEmail(event.target.value)}
        />
        <AuthField
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          tone={filledFieldTone(password)}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          type="submit"
          disabled={pending}
          className="auth-submit"
        >
          {pending ? "Signing in…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
