import { useQuery } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { DEFAULT_GROQ_MODEL_ID, GPT_CATEGORIES, GPT_VISIBILITY, type GptCategory, type GptVisibility, type ModelCapability } from "@aether/shared";
import { api } from "@/services/api";
import type { GptFormValue } from "@/utils/gptForm";

const CAPABILITIES: ModelCapability[] = ["webSearch", "imageGeneration", "files", "tools"];

export function GptForm({
  value,
  onChange,
  onSubmit,
  submitLabel,
  pending = false,
}: {
  value: GptFormValue;
  onChange: (value: GptFormValue) => void;
  onSubmit: () => void;
  submitLabel: string;
  pending?: boolean;
}) {
  const filesQuery = useQuery({
    queryKey: ["files"],
    queryFn: () => api.files.list(),
  });

  function toggleCapability(capability: ModelCapability): void {
    const next = value.capabilities.includes(capability)
      ? value.capabilities.filter((item) => item !== capability)
      : [...value.capabilities, capability];
    onChange({ ...value, capabilities: next });
  }

  function toggleFile(fileId: string): void {
    const next = value.knowledgeFileIds.includes(fileId)
      ? value.knowledgeFileIds.filter((item) => item !== fileId)
      : [...value.knowledgeFileIds, fileId];
    onChange({ ...value, knowledgeFileIds: next });
  }

  return (
    <form
      className="space-y-4"
      aria-label="GPT builder"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label className="block text-sm">
        Name
        <input
          required
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Description
        <textarea
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          rows={2}
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Instructions
        <textarea
          value={value.instructions}
          onChange={(event) => onChange({ ...value, instructions: event.target.value })}
          rows={6}
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Conversation starters (one per line)
        <textarea
          value={value.conversationStarters}
          onChange={(event) => onChange({ ...value, conversationStarters: event.target.value })}
          rows={3}
          className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Visibility
          <select
            value={value.visibility}
            onChange={(event) => onChange({ ...value, visibility: event.target.value as GptVisibility })}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          >
            {GPT_VISIBILITY.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Category
          <select
            value={value.category}
            onChange={(event) => onChange({ ...value, category: event.target.value as GptCategory })}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          >
            {GPT_CATEGORIES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Preferred provider
          <input
            value={value.providerId}
            onChange={(event) => onChange({ ...value, providerId: event.target.value })}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
            placeholder="groq"
          />
        </label>
        <label className="block text-sm">
          Preferred model
          <input
            value={value.modelId}
            onChange={(event) => onChange({ ...value, modelId: event.target.value })}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
            placeholder={DEFAULT_GROQ_MODEL_ID}
          />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm">Capabilities</legend>
        {CAPABILITIES.map((capability) => (
          <label key={capability} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.capabilities.includes(capability)}
              onChange={() => toggleCapability(capability)}
            />
            {capability}
          </label>
        ))}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm">Knowledge files</legend>
        <p className="text-xs text-fg-muted">
          Attached files are injected as text context. This is not a vector search index.
        </p>
        {filesQuery.data?.files.length ? (
          filesQuery.data.files.map((file) => (
            <label key={file.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={value.knowledgeFileIds.includes(file.id)}
                onChange={() => toggleFile(file.id)}
              />
              {file.originalName}
            </label>
          ))
        ) : (
          <p className="text-sm text-fg-muted">Upload files in chat first, then attach them here.</p>
        )}
      </fieldset>
      <button
        type="submit"
        disabled={pending || !value.name.trim()}
        className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
