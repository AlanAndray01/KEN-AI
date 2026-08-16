import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiError } from "@/services/api";

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
      await register({ name, email, password });
      void navigate(CLIENT_ROUTES.chat);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Create account</h1>
        <p className="text-sm text-fg-muted">Email and password registration. Google can be linked later.</p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <form className="space-y-3" onSubmit={onSubmit} aria-label="Create account">
        <label className="block text-sm">
          Name
          <input
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
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
            autoComplete="new-password"
            required
            minLength={8}
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
          {pending ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="text-sm text-fg-muted">
        Already have an account?{" "}
        <Link to={CLIENT_ROUTES.login} className="text-accent underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
