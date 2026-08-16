import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "@/services/api";

export function AdminUsagePage() {
  const query = useQuery({
    queryKey: ["admin", "usage"],
    queryFn: () => api.admin.usage(),
  });

  const usage = query.data?.usage;
  const totals = usage?.totals;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-6 px-6 py-16">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Admin</p>
        <h1 className="text-3xl font-semibold tracking-tight">Usage</h1>
        <p className="text-fg-muted">
          Totals come from stored usage records written after each generation. Zero means nobody has chatted yet.
        </p>
      </div>
      {query.isLoading ? <p className="text-fg-muted">Loading usage…</p> : null}
      {query.isError ? (
        <p className="text-danger">{query.error instanceof ApiError ? query.error.message : "Unable to load usage."}</p>
      ) : null}
      {totals ? (
        <dl className="grid gap-3 sm:grid-cols-4">
          <Stat label="Requests" value={totals.requests} />
          <Stat label="Input tokens" value={totals.inputTokens} />
          <Stat label="Output tokens" value={totals.outputTokens} />
          <Stat label="Failures" value={totals.failures} />
        </dl>
      ) : null}
      {usage && usage.byProvider.length === 0 && usage.recent.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-fg-muted">
          No usage records yet.
        </p>
      ) : null}
      {usage && usage.byModel.length > 0 ? (
        <section className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Usage by model</caption>
            <thead className="bg-surface-muted text-fg-muted">
              <tr>
                <th className="px-3 py-2 font-medium">Provider</th>
                <th className="px-3 py-2 font-medium">Model</th>
                <th className="px-3 py-2 font-medium">Requests</th>
                <th className="px-3 py-2 font-medium">Input tokens</th>
                <th className="px-3 py-2 font-medium">Output tokens</th>
                <th className="px-3 py-2 font-medium">Failures</th>
              </tr>
            </thead>
            <tbody>
              {usage.byModel.map((row) => (
                <tr key={row.key} className="border-t border-border">
                  <td className="px-3 py-2">{row.providerId}</td>
                  <td className="px-3 py-2">{row.modelId ?? "—"}</td>
                  <td className="px-3 py-2">{row.requests}</td>
                  <td className="px-3 py-2">{row.inputTokens}</td>
                  <td className="px-3 py-2">{row.outputTokens}</td>
                  <td className="px-3 py-2">{row.failures}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
      {usage && usage.recent.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-lg font-medium">Recent generations</h2>
          <ul className="space-y-1 text-sm">
            {usage.recent.map((record) => (
              <li key={record.id} className="rounded-lg border border-border bg-surface px-3 py-2">
                {record.providerId}/{record.modelId} · {record.success ? "ok" : record.errorCode ?? "failed"} ·{" "}
                {new Date(record.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
    </div>
  );
}
