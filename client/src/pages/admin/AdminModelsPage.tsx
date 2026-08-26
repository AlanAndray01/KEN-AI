import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { api } from "@/services/api";

export function AdminModelsPage() {
  const queryClient = useQueryClient();
  const modelsQuery = useQuery({
    queryKey: ["admin", "models"],
    queryFn: () => api.admin.models.list(),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { providerId: string; modelId: string; enabled: boolean }) =>
      api.admin.models.update(input.providerId, input.modelId, { enabled: input.enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin", "models"] });
    },
  });

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 px-6 py-16">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Admin</p>
        <h1 className="text-3xl font-semibold tracking-tight">Model registry</h1>
        <p className="text-fg-muted">
          Enabled models appear in GET /api/models only when their provider is configured.
        </p>
      </div>
      {modelsQuery.isLoading ? <p className="text-fg-muted">Loading models…</p> : null}
      {modelsQuery.isError ? <p className="text-danger">Unable to load models.</p> : null}
      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-fg-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Model</th>
              <th className="px-4 py-3 font-medium">Provider</th>
              <th className="px-4 py-3 font-medium">Available</th>
              <th className="px-4 py-3 font-medium">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {modelsQuery.data?.models.map((model) => (
              <tr key={`${model.providerId}:${model.id}`} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{model.name}</div>
                  <div className="text-fg-muted">{model.id}</div>
                </td>
                <td className="px-4 py-3">{model.providerId}</td>
                <td className="px-4 py-3">{model.available ? "Yes" : "No"}</td>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={model.enabled}
                    aria-label={`Enable ${model.name}`}
                    onChange={(event) =>
                      toggleMutation.mutate({
                        providerId: model.providerId,
                        modelId: model.id,
                        enabled: event.target.checked,
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link to={CLIENT_ROUTES.adminProviders} className="text-sm text-accent underline-offset-4 hover:underline">
        Provider configuration
      </Link>
    </div>
  );
}
