import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { GptForm } from "@/components/GptForm";
import { emptyGptForm, gptFormToPayload, type GptFormValue } from "@/utils/gptForm";
import { ApiError, api } from "@/services/api";
import { useModelStore } from "@/stores/modelStore";
import { toast } from "@/stores/toastStore";

export function GptDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const setSelection = useModelStore((state) => state.setSelection);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<GptFormValue>(emptyGptForm);

  const gptQuery = useQuery({
    queryKey: ["gpts", id],
    queryFn: () => api.gpts.get(id ?? ""),
    enabled: Boolean(id),
  });
  const gpt = gptQuery.data?.gpt;

  useEffect(() => {
    if (!gpt) return;
    setForm({
      name: gpt.name,
      description: gpt.description ?? "",
      instructions: gpt.instructions ?? "",
      conversationStarters: gpt.conversationStarters.join("\n"),
      visibility: gpt.visibility,
      category: gpt.category,
      modelId: gpt.modelId ?? "",
      providerId: gpt.providerId ?? "",
      capabilities: gpt.capabilities,
      knowledgeFileIds: gpt.knowledgeFileIds,
    });
  }, [gpt]);

  const updateMutation = useMutation({
    mutationFn: () => api.gpts.update(id ?? "", gptFormToPayload(form)),
    onSuccess: async () => {
      toast("GPT updated", "success");
      setEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["gpts", id] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to update GPT", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.gpts.remove(id ?? ""),
    onSuccess: () => {
      toast("GPT deleted", "success");
      void navigate(CLIENT_ROUTES.gpts);
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to delete GPT", "error");
    },
  });

  function startChat(): void {
    if (!gpt) return;
    if (gpt.providerId && gpt.modelId) setSelection(gpt.providerId, gpt.modelId);
    void navigate(`/chat?gpt=${gpt.id}`);
  }

  if (gptQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-fg-muted">Loading GPT…</p>
      </div>
    );
  }

  if (!gpt) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">GPT not found</h1>
        <Link to={CLIENT_ROUTES.gpts} className="mt-4 inline-block text-sm text-accent">
          Back to GPTs
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">GPTs</p>
        <h1 className="text-3xl font-semibold tracking-tight">{gpt.name}</h1>
        <p className="text-fg-muted">{gpt.description || "No description"}</p>
        <p className="text-xs text-fg-muted">
          {gpt.category} · {gpt.visibility}
          {gpt.mine ? " · yours" : ""}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
          onClick={startChat}
        >
          Start chat
        </button>
        {gpt.mine ? (
          <>
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm"
              onClick={() => setEditing((value) => !value)}
            >
              {editing ? "Close editor" : "Edit"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-border px-4 py-2 text-sm text-danger"
              onClick={() => {
                if (window.confirm("Delete this GPT?")) deleteMutation.mutate();
              }}
            >
              Delete
            </button>
          </>
        ) : null}
      </div>
      {gpt.conversationStarters.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Conversation starters</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {gpt.conversationStarters.map((starter) => (
              <li key={starter}>
                <button
                  type="button"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-left text-sm hover:bg-surface-muted"
                  onClick={() => {
                    startChat();
                  }}
                >
                  {starter}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {editing && gpt.mine ? (
        <GptForm
          value={form}
          onChange={setForm}
          onSubmit={() => updateMutation.mutate()}
          submitLabel="Save GPT"
          pending={updateMutation.isPending}
        />
      ) : gpt.mine && gpt.instructions ? (
        <section className="rounded-xl border border-border bg-surface px-4 py-3">
          <h2 className="text-sm font-medium">Instructions</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">{gpt.instructions}</p>
        </section>
      ) : null}
      <Link to={CLIENT_ROUTES.gpts} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to GPTs
      </Link>
    </div>
  );
}
