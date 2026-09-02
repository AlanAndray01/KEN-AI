import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CLIENT_ROUTES, passwordSchema } from "@Ken/shared";
import { AuthField } from "@/components/AuthField";
import { AuthModeNav } from "@/components/AuthModeNav";
import { GoogleMark } from "@/components/GoogleMark";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/services/api";
import { emailFieldTone } from "@/utils/authFieldTone";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const result = await register({ name, email, password });
      void navigate(`${CLIENT_ROUTES.verifyEmail}?email=${encodeURIComponent(result.email)}`, {
        state: { emailSent: result.emailSent },
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-stack">
      <AuthModeNav />
      <div className="space-y-1 text-center">
        <h1 className="text-2xl tracking-tight">Create your account</h1>
        <p className="text-sm text-fg-muted">Use Google or an email and password. Keys stay on the server.</p>
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
      <form className="space-y-3" onSubmit={onSubmit} aria-label="Create account">
        <AuthField
          label="Name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
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
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          tone={password ? (passwordSchema.safeParse(password).success ? "success" : "error") : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
        <p className="text-xs text-fg-muted">
          Use at least 6 characters.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="auth-submit"
        >
          {pending ? "Creating account…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
