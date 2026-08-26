import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";

export function SettingsNotificationsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications.list(),
  });

  const markAll = useMutation({
    mutationFn: () => api.notifications.markAllRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to update notifications", "error");
    },
  });

  const markOne = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = query.data?.notifications ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-fg-muted">
          These are events stored for your account, such as share links and exports. This page does not invent alerts.
        </p>
      </div>
      {query.isLoading ? <p className="text-fg-muted">Loading notifications…</p> : null}
      {query.isError ? <p className="text-danger">Unable to load notifications.</p> : null}
      {notifications.length > 0 ? (
        <button
          type="button"
          className="self-start text-sm text-accent underline-offset-4 hover:underline"
          onClick={() => markAll.mutate()}
        >
          Mark all as read
        </button>
      ) : null}
      {query.data && notifications.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-fg-muted">
          No notifications yet.
        </p>
      ) : null}
      <ul className="space-y-2">
        {notifications.map((item) => (
          <li key={item.id} className="rounded-xl border border-border bg-surface px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">{item.title}</div>
                <p className="text-sm text-fg-muted">{item.body}</p>
                <p className="mt-1 text-xs text-fg-muted">{new Date(item.createdAt).toLocaleString()}</p>
              </div>
              {item.readAt ? (
                <span className="text-xs text-fg-muted">Read</span>
              ) : (
                <button
                  type="button"
                  className="text-xs text-accent underline-offset-4 hover:underline"
                  onClick={() => markOne.mutate(item.id)}
                >
                  Mark read
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
