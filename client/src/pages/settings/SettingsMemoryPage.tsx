import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";

export function SettingsMemoryPage() {
  const queryClient = useQueryClient();
  const memoriesQuery = useQuery({
    queryKey: ["memories"],
    queryFn: () => api.memories.list(),
  });
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const createMutation = useMutation({
    mutationFn: () => api.memories.create({ content: draft.trim() }),
    onSuccess: async () => {
      setDraft("");
      toast("Memory saved", "success");
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to save memory", "error");
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => api.memories.update(editingId ?? "", { content: editingValue.trim() }),
    onSuccess: async () => {
      setEditingId(null);
      toast("Memory updated", "success");
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to update memory", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.memories.remove(id),
    onSuccess: async () => {
      toast("Memory deleted", "success");
      await queryClient.invalidateQueries({ queryKey: ["memories"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to delete memory", "error");
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Memory</h1>
        <p className="text-fg-muted">
          Saved facts are injected into the model context. Aether does not invent memories.
        </p>
      </div>
      <form
        className="flex flex-col gap-2"
        aria-label="Add memory"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          if (!draft.trim()) return;
          createMutation.mutate();
        }}
      >
        <label className="block text-sm">
          New memory
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
            placeholder="I prefer concise answers and TypeScript examples."
          />
        </label>
        <button
          type="submit"
          disabled={createMutation.isPending || !draft.trim()}
          className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {createMutation.isPending ? "Saving…" : "Save memory"}
        </button>
      </form>
      {memoriesQuery.isLoading ? <p className="text-fg-muted">Loading memories…</p> : null}
      {memoriesQuery.data?.memories.length === 0 ? (
        <p className="text-sm text-fg-muted">No memories yet.</p>
      ) : (
        <ul className="space-y-2">
          {memoriesQuery.data?.memories.map((memory) => (
            <li key={memory.id} className="rounded-xl border border-border bg-surface px-4 py-3">
              {editingId === memory.id ? (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (editingValue.trim()) updateMutation.mutate();
                  }}
                >
                  <textarea
                    value={editingValue}
                    onChange={(event) => setEditingValue(event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
                    aria-label="Edit memory"
                  />
                  <div className="flex gap-2">
                    <button type="submit" className="rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-fg">
                      Update
                    </button>
                    <button type="button" className="text-sm text-fg-muted" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="text-sm">{memory.content}</p>
                  <p className="mt-1 text-xs text-fg-muted">{memory.source}</p>
                  <div className="mt-2 flex gap-3 text-sm">
                    <button
                      type="button"
                      className="text-accent"
                      onClick={() => {
                        setEditingId(memory.id);
                        setEditingValue(memory.content);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-danger"
                      onClick={() => {
                        if (window.confirm("Delete this memory?")) deleteMutation.mutate(memory.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
