import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { OtpInput } from "@/components/OtpInput";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/services/api";
import { toast } from "@/stores/toastStore";

const RESEND_COOLDOWN_SECONDS = 60;

export function VerifyEmailPage() {
  const { verifyEmail, resendCode } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const email = useMemo(() => params.get("email")?.trim().toLowerCase() ?? "", [params]);
  const emailSent = (location.state as { emailSent?: boolean } | null)?.emailSent;
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => {
      setCooldown((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function submitCode(nextCode: string): Promise<void> {
    if (!email || nextCode.length !== 6 || inFlight.current) return;
    inFlight.current = true;
    setError("");
    setPending(true);
    try {
      await verifyEmail(email, nextCode);
      toast("Email verified. You're signed in.", "success");
      void navigate(CLIENT_ROUTES.chat, { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to verify that code";
      setError(message);
      toast(message, "error");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    await submitCode(code);
  }

  async function onResend(): Promise<void> {
    if (!email || cooldown > 0 || pending) return;
    setError("");
    try {
      await resendCode(email);
      setCooldown(RESEND_COOLDOWN_SECONDS);
      toast("A new code is on its way if that email can be verified.", "success");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unable to resend the code";
      setError(message);
      toast(message, "error");
    }
  }

  if (!email) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="text-sm text-fg-muted">Start from sign up or sign in so we know which address to verify.</p>
        <Link to={CLIENT_ROUTES.login} className="text-sm font-medium text-accent hover:underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Enter the 6-digit code</h1>
        <p className="text-sm text-fg-muted">
          We sent a verification code to <span className="font-medium text-fg">{email}</span>. It expires in 15 minutes.
        </p>
      </div>
      {emailSent === false ? (
        <p className="text-center text-sm text-fg-muted">
          Mail was not delivered. In development, look for <code className="font-mono text-fg">[DEV AUTH CODE]</code> in
          the API terminal. For inbox delivery, set <code className="font-mono text-fg">RESEND_API_KEY</code> and a
          verified sender. Resend's test address only delivers to the account that owns the API key until you add a
          domain.
        </p>
      ) : null}
      {error ? (
        <p className="text-center text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <form className="space-y-5" onSubmit={onSubmit} aria-label="Verify email">
        <OtpInput
          value={code}
          disabled={pending}
          error={Boolean(error)}
          onChange={(next) => {
            setCode(next);
            setError("");
            if (next.length === 6) {
              void submitCode(next);
            }
          }}
        />
        <button
          type="submit"
          disabled={pending || code.length !== 6}
          className="w-full rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-canvas disabled:opacity-60"
        >
          {pending ? "Verifying…" : "Verify email"}
        </button>
      </form>
      <p className="text-center text-sm text-fg-muted">
        {cooldown > 0 ? (
          <span>Resend code in {cooldown}s</span>
        ) : (
          <button type="button" className="font-medium text-accent hover:underline" onClick={() => void onResend()}>
            Resend code
          </button>
        )}
      </p>
      <p className="text-center text-sm">
        <Link to={CLIENT_ROUTES.login} className="text-fg-muted hover:text-fg">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
