import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { CLIENT_ROUTES } from "@Ken/shared";
import { Link } from "react-router-dom";
import { ApiError, api } from "@/services/api";
import { QUERY_STALE_MS } from "@/query";

const BYOK_PROVIDERS = [
  { id: "gemini", label: "Google Gemini" },
  { id: "groq", label: "Groq Cloud" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "openai", label: "OpenAI" },
  { id: "ollama", label: "Ollama (local)" },
] as const;

export function SettingsModelsPage() {
  const queryClient = useQueryClient();
  const modelsQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => api.models.list(),
    staleTime: QUERY_STALE_MS,
  });
  const credentialsQuery = useQuery({
    queryKey: ["me", "credentials"],
    queryFn: () => api.me.credentials.list(),
    staleTime: QUERY_STALE_MS,
  });
  const [providerId, setProviderId] = useState("gemini");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");

  const saveMutation = useMutation({
    mutationFn: () => api.settings.saveKey({ providerId, apiKey }),
    onSuccess: async () => {
      setApiKey("");
      setError("");
      setTestResult("");
      await queryClient.invalidateQueries({ queryKey: ["me", "credentials"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Unable to save credential");
    },
  });

  const testMutation = useMutation({
    mutationFn: () => api.me.credentials.test(providerId, apiKey.trim() ? { apiKey } : {}),
    onSuccess: (result) => {
      setError("");
      setTestResult(
        result.status === "connected"
          ? result.message || "Connected"
          : `${result.status}: ${result.message}`,
      );
    },
    onError: (err: unknown) => {
      setTestResult("");
      setError(err instanceof ApiError ? err.message : "Unable to test credential");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.me.credentials.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me", "credentials"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Unable to delete credential");
    },
  });

  const saved = credentialsQuery.data?.credentials.filter((item) => item.configured) ?? [];

  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 px-6 py-16">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">API Keys & Models</h1>
        <p className="text-fg-muted">
          Bring-your-own keys are encrypted with AES-256-GCM and never returned to the browser. If you
          do not save a key, chat uses the server env key for that provider and is rate-limited more
          strictly.
        </p>
      </div>
      <p className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
        Gemini is the default when a Google AI Studio key is saved.
      </p>
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
        {saved.length > 0 ? (
          <ul className="space-y-2 text-sm">
            {saved.map((item) => (
              <li key={item.providerId} className="flex items-center justify-between gap-3">
                <span>
                  {item.providerId}: {item.keyLastFour ? `••••${item.keyLastFour}` : "configured"}
                </span>
                <button
                  type="button"
                  className="text-sm text-danger underline-offset-4 hover:underline disabled:opacity-60"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(item.providerId)}
                >
                  Remove
                </button>
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
        {testResult ? (
          <p className="text-sm text-fg-muted" role="status">
            {testResult}
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
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
            >
              {BYOK_PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={testMutation.isPending || saveMutation.isPending}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium disabled:opacity-60"
              onClick={() => testMutation.mutate()}
            >
              {testMutation.isPending ? "Testing…" : "Test Connection"}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save key"}
            </button>
          </div>
        </form>
      </section>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
