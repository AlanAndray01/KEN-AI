import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { DEFAULT_GEMINI_MODEL_ID } from "@Ken/shared";
import { ApiError, api } from "@/services/api";

const PROVIDERS = [
  { id: "gemini", label: "Google Gemini" },
  { id: "groq", label: "Groq" },
  { id: "openai", label: "OpenAI" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "anthropic", label: "Anthropic (Claude)" },
  { id: "ollama", label: "Ollama" },
] as const;

interface AddModelKeysDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AddModelKeysDialog({ open, onClose }: AddModelKeysDialogProps) {
  const queryClient = useQueryClient();
  const titleId = useId();
  const [label, setLabel] = useState("");
  const [providerId, setProviderId] = useState("gemini");
  const [modelId, setModelId] = useState(DEFAULT_GEMINI_MODEL_ID);
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");

  const credentialsQuery = useQuery({
    queryKey: ["me", "credentials"],
    queryFn: () => api.me.credentials.list(),
    enabled: open,
  });

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.settings.saveKey({
        providerId,
        apiKey,
        ...(modelId.trim() ? { modelId: modelId.trim() } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      }),
    onSuccess: async () => {
      setApiKey("");
      setError("");
      setTestResult("");
      await queryClient.invalidateQueries({ queryKey: ["me", "credentials"] });
      await queryClient.invalidateQueries({ queryKey: ["models"] });
      onClose();
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <button type="button" className="absolute inset-0 bg-black/40" aria-label="Close dialog" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="auth-glass relative z-10 w-full max-w-md rounded-[1.5rem] border border-border p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              Add model / API key
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              Keys are encrypted on the server and never returned to the browser. This does not write `.env`.
              Gemini uses a Google AI Studio key. Claude requires an official Anthropic key.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-fg-muted hover:bg-surface-muted"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="size-4" />
          </button>
        </div>
        {credentialsQuery.data?.credentials.some((item) => item.configured) ? (
          <ul className="mb-4 space-y-1 text-sm text-fg-muted">
            {credentialsQuery.data.credentials
              .filter((item) => item.configured)
              .map((item) => (
                <li key={item.providerId}>
                  {item.providerId}: {item.keyLastFour ? `••••${item.keyLastFour}` : "configured"}
                </li>
              ))}
          </ul>
        ) : null}
        {error ? (
          <p className="mb-3 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {testResult ? (
          <p className="mb-3 text-sm text-fg-muted" role="status">
            {testResult}
          </p>
        ) : null}
        <form
          className="space-y-3"
          aria-label="Save provider key"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            saveMutation.mutate();
          }}
        >
          <label className="block text-sm">
            Model name / label
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="DeepSeek R1"
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            Provider
            <select
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2"
            >
              {PROVIDERS.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Model ID
            <input
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              placeholder={DEFAULT_GEMINI_MODEL_ID}
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            API key
            <input
              type="password"
              autoComplete="off"
              required
              minLength={8}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-canvas px-3 py-2"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={testMutation.isPending || saveMutation.isPending}
              className="flex-1 rounded-full border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              onClick={() => testMutation.mutate()}
            >
              {testMutation.isPending ? "Testing…" : "Test Connection"}
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="flex-1 rounded-full bg-fg px-4 py-2.5 text-sm font-medium text-canvas disabled:opacity-60"
            >
              {saveMutation.isPending ? "Saving…" : "Save key"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
