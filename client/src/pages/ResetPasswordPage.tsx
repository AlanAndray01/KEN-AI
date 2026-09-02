import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CLIENT_ROUTES, passwordSchema } from "@Ken/shared";
import { AuthField } from "@/components/AuthField";
import { OtpInput } from "@/components/OtpInput";
import { ApiError, api } from "@/services/api";
import { emailFieldTone } from "@/utils/authFieldTone";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const emailFromQuery = useMemo(() => params.get("email")?.trim().toLowerCase() ?? "", [params]);
  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState(params.get("token")?.replace(/\D/g, "").slice(0, 6) ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!email || code.length !== 6) {
      setError("Enter your email and the 6-digit code.");
      return;
    }
    setError("");
    setPending(true);
    try {
      await api.auth.resetPassword({ email, code, password });
      void navigate(CLIENT_ROUTES.login);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to reset password");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-stack">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl tracking-tight">Reset password</h1>
        <p className="text-sm text-fg-muted">Enter the 6-digit code and choose a new password.</p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <form className="space-y-3" onSubmit={onSubmit} aria-label="Reset password">
        <AuthField
          label="Email address"
          type="email"
          autoComplete="email"
          required
          value={email}
          tone={emailFieldTone(email)}
          onChange={(event) => setEmail(event.target.value)}
        />
        <OtpInput value={code} error={Boolean(error)} onChange={setCode} />
        <AuthField
          label="New password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          value={password}
          tone={password ? (passwordSchema.safeParse(password).success ? "success" : "error") : undefined}
          onChange={(event) => setPassword(event.target.value)}
        />
        <button
          type="submit"
          disabled={pending || code.length !== 6}
          className="auth-submit"
        >
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
      <Link to={CLIENT_ROUTES.login} className="block text-center text-sm text-fg-muted underline-offset-4 hover:underline">
        Back to sign in
      </Link>
    </div>
  );
}
