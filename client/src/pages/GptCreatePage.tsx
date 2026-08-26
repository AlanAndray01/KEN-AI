import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { GptForm } from "@/components/GptForm";
import { emptyGptForm, gptFormToPayload, type GptFormValue } from "@/utils/gptForm";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";

export function GptCreatePage() {
  const navigate = useNavigate();
  const [value, setValue] = useState<GptFormValue>(emptyGptForm);
  const createMutation = useMutation({
    mutationFn: () => api.gpts.create(gptFormToPayload(value)),
    onSuccess: ({ gpt }) => {
      toast("GPT saved", "success");
      void navigate(`/gpts/${gpt.id}`);
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to create GPT", "error");
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">GPTs</p>
        <h1 className="text-3xl font-semibold tracking-tight">Create a GPT</h1>
        <p className="text-fg-muted">
          Instructions persist in MongoDB and are injected into ContextManager when this GPT is used.
        </p>
      </div>
      <GptForm
        value={value}
        onChange={setValue}
        onSubmit={() => createMutation.mutate()}
        submitLabel="Create GPT"
        pending={createMutation.isPending}
      />
      <Link to={CLIENT_ROUTES.gpts} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to GPTs
      </Link>
    </div>
  );
}
