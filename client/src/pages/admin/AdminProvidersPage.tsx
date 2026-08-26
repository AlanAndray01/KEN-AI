import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES, PROVIDER_TYPES, type PublicAIProvider } from "@Ken/shared";
import { ApiError, api } from "@/services/api";

export function AdminProvidersPage() {
  const queryClient = useQueryClient();
  const providersQuery = useQuery({
    queryKey: ["admin", "providers"],
    queryFn: () => api.admin.providers.list(),
  });
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<PublicAIProvider["type"]>("openai-compatible");
  const [newKey, setNewKey] = useState("");
  const [newBaseUrl, setNewBaseUrl] = useState("");

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "providers"] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.admin.providers.create({
        name: newName,
        type: newType,
        ...(newKey ? { apiKey: newKey } : {}),
        ...(newBaseUrl ? { baseUrl: newBaseUrl } : {}),
      }),
    onSuccess: async () => {
      setNewName("");
      setNewKey("");
      setNewBaseUrl("");
      setError("");
      await invalidate();
    },
    onError: (err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Unable to create provider");
    },
  });

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 px-6 py-16">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Admin</p>
        <h1 className="text-3xl font-semibold tracking-tight">AI providers</h1>
        <p className="text-fg-muted">
          Keys are stored encrypted on the server. Responses only show a masked suffix.
        </p>
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {providersQuery.isLoading ? <p className="text-fg-muted">Loading providers…</p> : null}
      {providersQuery.isError ? (
        <p className="text-danger">Unable to load providers.</p>
      ) : null}
      <div className="space-y-4">
        {providersQuery.data?.providers.map((provider) => (
          <ProviderCard
            key={provider.providerId}
            provider={provider}
            onError={setError}
            onChanged={invalidate}
          />
        ))}
      </div>
      <form
        className="space-y-3 rounded-xl border border-border bg-surface p-4"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          createMutation.mutate();
        }}
        aria-label="Add provider"
      >
        <h2 className="text-lg font-medium">Add provider</h2>
        <label className="block text-sm">
          Name
          <input
            required
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Type
          <select
            value={newType}
            onChange={(event) => setNewType(event.target.value as PublicAIProvider["type"])}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          >
            {PROVIDER_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Base URL
          <input
            type="url"
            value={newBaseUrl}
            onChange={(event) => setNewBaseUrl(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          API key
          <input
            type="password"
            autoComplete="off"
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {createMutation.isPending ? "Saving…" : "Save provider"}
        </button>
      </form>
      <Link to={CLIENT_ROUTES.adminModels} className="text-sm text-accent underline-offset-4 hover:underline">
        Manage models
      </Link>
    </div>
  );
}

function ProviderCard({
  provider,
  onError,
  onChanged,
}: {
  provider: PublicAIProvider;
  onError: (message: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [apiKey, setApiKey] = useState("");

  const saveMutation = useMutation({
    mutationFn: () =>
      api.admin.providers.update(provider.id, {
        ...(apiKey ? { apiKey } : {}),
      }),
    onSuccess: async () => {
      setApiKey("");
      onError("");
      await onChanged();
    },
    onError: (err: unknown) => onError(err instanceof ApiError ? err.message : "Unable to update provider"),
  });

  const testMutation = useMutation({
    mutationFn: () => api.admin.providers.test(provider.id, apiKey ? { apiKey } : undefined),
    onSuccess: async () => {
      onError("");
      await onChanged();
    },
    onError: (err: unknown) => onError(err instanceof ApiError ? err.message : "Connection test failed"),
  });

  const enableMutation = useMutation({
    mutationFn: (enabled: boolean) => api.admin.providers.enable(provider.id, enabled),
    onSuccess: async () => {
      onError("");
      await onChanged();
    },
    onError: (err: unknown) => onError(err instanceof ApiError ? err.message : "Unable to update provider"),
  });

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">{provider.name}</h2>
          <p className="text-sm text-fg-muted">
            {provider.type} · {provider.configured ? `configured ${provider.keyLastFour ? `••••${provider.keyLastFour}` : ""}` : "not configured"} ·{" "}
            {provider.source}
          </p>
          {provider.lastTestStatus ? (
            <p className="text-sm text-fg-muted">
              Last test: {provider.lastTestStatus}
              {provider.lastTestMessage ? ` — ${provider.lastTestMessage}` : ""}
            </p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={provider.enabled}
            onChange={(event) => enableMutation.mutate(event.target.checked)}
          />
          Enabled
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          type="password"
          autoComplete="off"
          placeholder="New API key"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          className="min-w-56 flex-1 rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
        />
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !apiKey}
        >
          Save key
        </button>
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-2 text-sm"
          onClick={() => testMutation.mutate()}
          disabled={testMutation.isPending}
        >
          Test connection
        </button>
      </div>
    </section>
  );
}
