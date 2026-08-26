import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";

export function SettingsAccountPage() {
  const { user, refreshUser } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pendingProfile, setPendingProfile] = useState(false);
  const [pendingPassword, setPendingPassword] = useState(false);

  async function saveProfile(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPendingProfile(true);
    try {
      await api.me.update({ name });
      await refreshUser();
      toast("Profile saved", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to save profile", "error");
    } finally {
      setPendingProfile(false);
    }
  }

  async function savePassword(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPendingPassword(true);
    try {
      await api.auth.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast("Password updated. Sign in again with the new password.", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to change password", "error");
    } finally {
      setPendingPassword(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
        <p className="text-fg-muted">Your name is stored on the server. Email cannot be changed here.</p>
      </div>
      <form className="space-y-3 rounded-xl border border-border bg-surface p-4" aria-label="Profile" onSubmit={(event) => void saveProfile(event)}>
        <label className="block text-sm">
          Name
          <input
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            readOnly
            value={user?.email ?? ""}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2 text-fg-muted"
          />
        </label>
        <button
          type="submit"
          disabled={pendingProfile}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pendingProfile ? "Saving…" : "Save profile"}
        </button>
      </form>
      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
        aria-label="Change password"
        onSubmit={(event) => void savePassword(event)}
      >
        <h2 className="text-lg font-medium">Change password</h2>
        <p className="text-sm text-fg-muted">
          New passwords need at least 6 characters. Changing the password revokes other sessions.
        </p>
        <label className="block text-sm">
          Current password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={6}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={pendingPassword}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pendingPassword ? "Updating…" : "Update password"}
        </button>
      </form>
      <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-medium">Security</h2>
        <p className="text-sm text-fg-muted">
          Two-factor authentication is not part of this release. Sessions use HttpOnly cookies and are
          revoked when you change your password.
        </p>
      </section>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
