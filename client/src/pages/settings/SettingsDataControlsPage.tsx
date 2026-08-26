import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CLIENT_ROUTES, type ExportFormat } from "@Ken/shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";
import { downloadBlob } from "@/utils/download";

/** Everything the purge removes, shown before the user commits to it. */
const DELETED_DATA = [
  "All conversations and messages",
  "Uploaded files and attachments",
  "Saved memories and custom instructions",
  "Custom GPTs you created",
  "Saved provider API keys",
  "Share links, notifications, and usage history",
];

export function SettingsDataControlsPage() {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const usageQuery = useQuery({
    queryKey: ["me", "usage"],
    queryFn: () => api.me.usage(),
  });

  async function exportAll(format: ExportFormat): Promise<void> {
    setExporting(format);
    try {
      const file = await api.me.exportChats(format);
      downloadBlob(file.blob, file.filename);
      toast(`Exported chats as ${format.toUpperCase()}`, "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to export chats", "error");
    } finally {
      setExporting(null);
    }
  }

  const totals = usageQuery.data?.usage.totals;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Data controls</h1>
        <p className="text-fg-muted">
          Export the conversations stored for your account, or permanently delete your account and
          everything in it.
        </p>
      </div>
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-medium">Export chats</h2>
        <p className="text-sm text-fg-muted">Downloads the messages currently saved in MongoDB. Empty chats export as empty files.</p>
        <div className="flex flex-wrap gap-2">
          {(["md", "json", "txt"] as const).map((format) => (
            <button
              key={format}
              type="button"
              disabled={exporting !== null}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted disabled:opacity-60"
              onClick={() => void exportAll(format)}
            >
              {exporting === format ? "Exporting…" : `Export ${format.toUpperCase()}`}
            </button>
          ))}
        </div>
      </section>
      <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-medium">Your usage</h2>
        {usageQuery.isLoading ? <p className="text-sm text-fg-muted">Loading usage…</p> : null}
        {usageQuery.isError ? <p className="text-sm text-danger">Unable to load usage.</p> : null}
        {totals ? (
          <p className="text-sm text-fg-muted">
            {totals.requests} request{totals.requests === 1 ? "" : "s"} · {totals.inputTokens} input tokens ·{" "}
            {totals.outputTokens} output tokens · {totals.failures} failed
          </p>
        ) : null}
      </section>
      <DeleteAccountSection />
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}

function DeleteAccountSection() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A Google-only account has no password on file, so the server accepts the
  // retyped email alone. Accounts that also registered locally still get asked.
  const passwordOptional = Boolean(user?.googleId);
  const emailMatches =
    user !== null && confirmEmail.trim().toLowerCase() === user.email.toLowerCase();
  const canSubmit = emailMatches && (passwordOptional || password.length > 0) && !deleting;

  function reset(): void {
    setConfirming(false);
    setConfirmEmail("");
    setPassword("");
    setError(null);
  }

  async function handleDelete(): Promise<void> {
    if (!canSubmit) return;
    setDeleting(true);
    setError(null);
    try {
      await api.me.deleteAccount({
        confirmEmail: confirmEmail.trim(),
        ...(password ? { password } : {}),
      });
      // The account is gone; clear local auth state before leaving the app.
      await logout();
      toast("Your account and all its data have been deleted", "success");
      navigate(CLIENT_ROUTES.home, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to delete your account");
      setDeleting(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-danger/40 bg-surface p-4">
      <h2 className="text-lg font-medium text-danger">Delete account</h2>
      <p className="text-sm text-fg-muted">
        This permanently deletes your account and everything below. It cannot be undone — export
        your chats first if you want to keep them.
      </p>
      <ul className="list-disc space-y-1 pl-5 text-sm text-fg-muted">
        {DELETED_DATA.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      {confirming ? (
        <form
          className="space-y-3 border-t border-border pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleDelete();
          }}
        >
          <div className="space-y-1">
            <label htmlFor="delete-confirm-email" className="block text-sm font-medium">
              Type <span className="font-mono">{user?.email}</span> to confirm
            </label>
            <input
              id="delete-confirm-email"
              type="email"
              autoComplete="off"
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="delete-confirm-password" className="block text-sm font-medium">
              Password {passwordOptional ? <span className="text-fg-muted">(only if you set one)</span> : null}
            </label>
            <input
              id="delete-confirm-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm outline-none focus:border-accent"
            />
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!canSubmit}
              className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Permanently delete my account"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={reset}
              className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-muted disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-lg border border-danger px-3 py-2 text-sm font-medium text-danger hover:bg-danger/10"
        >
          Delete account
        </button>
      )}
    </section>
  );
}
