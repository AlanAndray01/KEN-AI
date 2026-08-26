import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CLIENT_ROUTES } from "@aether/shared";
import { api } from "@/services/api";

export function SettingsVoicePage() {
  const statusQuery = useQuery({
    queryKey: ["voice-status"],
    queryFn: () => api.voice.status(),
  });
  const status = statusQuery.data;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Voice</h1>
        <p className="text-fg-muted">
          Server speech providers are optional. When they are not configured, the browser can still
          dictate with Speech Recognition and play replies with Speech Synthesis.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-surface px-4 py-4">
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="text-fg-muted">Provider</dt>
            <dd className="font-medium">{status?.provider ?? "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Speech to text</dt>
            <dd className="font-medium">{status?.sttConfigured ? "Configured" : "Not configured"}</dd>
          </div>
          <div>
            <dt className="text-fg-muted">Text to speech</dt>
            <dd className="font-medium">{status?.ttsConfigured ? "Configured" : "Not configured"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-fg-muted">
          {status?.message ?? "Voice is not configured. Set VOICE_PROVIDER on the server."}
        </p>
      </div>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
