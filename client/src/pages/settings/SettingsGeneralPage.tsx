import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES, UI_LANGUAGES } from "@Ken/shared";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";

export function SettingsGeneralPage() {
  const { user, refreshUser } = useAuth();
  const [language, setLanguage] = useState(user?.preferences?.language ?? "en");
  const [sendOnEnter, setSendOnEnter] = useState(user?.preferences?.sendOnEnter ?? false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    try {
      await api.me.update({ preferences: { language, sendOnEnter } });
      await refreshUser();
      toast("Preferences saved", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to save preferences", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">General</h1>
        <p className="text-fg-muted">
          Language is saved to your account. The interface is currently English. Send-on-Enter applies to the chat composer.
        </p>
      </div>
      <form className="space-y-4 rounded-xl border border-border bg-surface p-4" aria-label="General preferences" onSubmit={(event) => void onSubmit(event)}>
        <label className="block text-sm">
          Language
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          >
            {UI_LANGUAGES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={sendOnEnter}
            onChange={(event) => setSendOnEnter(event.target.checked)}
          />
          Press Enter to send. When off, Enter adds a new line and Ctrl/⌘+Enter sends. Touch keyboards always add a new line.
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </form>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
