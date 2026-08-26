import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";

export function SettingsPersonalizationPage() {
  const queryClient = useQueryClient();
  const instructionsQuery = useQuery({
    queryKey: ["instructions"],
    queryFn: () => api.instructions.get(),
  });
  const [aboutUser, setAboutUser] = useState("");
  const [howToRespond, setHowToRespond] = useState("");
  const [additional, setAdditional] = useState("");

  useEffect(() => {
    const instructions = instructionsQuery.data?.instructions;
    if (!instructions) return;
    setAboutUser(instructions.aboutUser);
    setHowToRespond(instructions.howToRespond);
    setAdditional(instructions.additional);
  }, [instructionsQuery.data?.instructions]);

  const saveMutation = useMutation({
    mutationFn: () => api.instructions.upsert({ aboutUser, howToRespond, additional }),
    onSuccess: async () => {
      toast("Custom instructions saved", "success");
      await queryClient.invalidateQueries({ queryKey: ["instructions"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to save instructions", "error");
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Personalization</h1>
        <p className="text-fg-muted">
          These instructions are injected into the model context for every chat. They are stored in MongoDB, not invented.
        </p>
      </div>
      <form
        className="space-y-4"
        aria-label="Custom instructions"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          saveMutation.mutate();
        }}
      >
        <label className="block text-sm">
          What should Ken know about you?
          <textarea
            value={aboutUser}
            onChange={(event) => setAboutUser(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          How should Ken respond?
          <textarea
            value={howToRespond}
            onChange={(event) => setHowToRespond(event.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          Anything else?
          <textarea
            value={additional}
            onChange={(event) => setAdditional(event.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-border bg-canvas px-3 py-2"
          />
        </label>
        <button
          type="submit"
          disabled={saveMutation.isPending}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg disabled:opacity-60"
        >
          {saveMutation.isPending ? "Saving…" : "Save instructions"}
        </button>
      </form>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
