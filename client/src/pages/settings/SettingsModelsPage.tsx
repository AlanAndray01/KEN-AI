import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CLIENT_ROUTES } from "@aether/shared";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/services/api";

export function SettingsModelsPage() {
  const queryClient = useQueryClient();
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models.list(),
  });
  const credentialsQuery = useQuery({
    queryKey: ["me", "credentials"],
    queryFn: () => api.me.credentials.list(),
  });
  const [providerId, setProviderId] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => api.me.credentials.upsert(providerId, { apiKey }),
    onSuccess: async () => {
      setApiKey("");
      setError("");
      await queryClient.invalidateQueries({ queryKey: ["me", "credentials"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Unable to save credential");
    },
  });

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">AI models</h1>
        <p className="text-fg-muted">
          Available models come from enabled, configured providers. Your keys stay on the server.
        </p>
      </div>
      {modelsQuery.isLoading ? <p className="text-fg-muted">Loading models…</p> : null}
      {modelsQuery.isError ? <p className="text-danger">Unable to load models.</p> : null}
      {modelsQuery.data && modelsQuery.data.models.length === 0 ? (
        <p className="text-fg-muted">No AI provider configured.</p>
      ) : null}
      <ul className="space-y-2">
        {modelsQuery.data?.models.map((model) => (
          <li key={`${model.providerId}:${model.id}`} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="font-medium">{model.name}</div>
            <div className="text-sm text-fg-muted">
              {model.providerId} · {model.id}
              {model.capabilities.length ? ` · ${model.capabilities.join(", ")}` : ""}
            </div>
          </li>
        ))}
      </ul>
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-medium">Your provider keys</h2>
        <p className="text-sm text-fg-muted">
          Optional bring-your-own keys. Saved values are encrypted and shown as a masked suffix only.
        </p>
        {credentialsQuery.data?.credentials.some((item) => item.configured) ? (
          <ul className="space-y-1 text-sm">
            {credentialsQuery.data.credentials
              .filter((item) => item.configured)
              .map((item) => (
                <li key={item.providerId}>
                  {item.providerId}: {item.keyLastFour ? `••••${item.keyLastFour}` : "configured"}
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No personal keys saved.</p>
        )}
        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <form
          className="space-y-3"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
          aria-label="Save provider key"
        >
          <label className="block text-sm">
            Provider
            <input
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            API key
            <input
              type="password"
              autoComplete="off"
              required
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
            />
          </label>
          <button
            type="submit"
            disabled={saveMutation.isPending}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
          >
            {saveMutation.isPending ? "Saving…" : "Save key"}
          </button>
        </form>
      </section>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
