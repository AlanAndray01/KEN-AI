import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES, type ExportFormat } from "@aether/shared";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";
import { downloadBlob } from "@/utils/download";

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
          Export the conversations stored for your account. Account deletion is not enabled yet — you can delete individual chats from the sidebar.
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
      <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-medium">Delete account</h2>
        <p className="text-sm text-fg-muted">
          Full account deletion is not enabled yet. Delete conversations from the chat sidebar if you want those messages removed.
        </p>
      </section>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
