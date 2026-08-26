import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { APP_NAME, CLIENT_ROUTES } from "@Ken/shared";
import { MarkdownContent } from "@/components/MarkdownContent";
import { ApiError, api } from "@/services/api";

export function SharePage() {
  const { token } = useParams();
  const query = useQuery({
    queryKey: ["share", token],
    queryFn: () => api.share.get(token ?? ""),
    enabled: Boolean(token),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-16 outline-none">
        <p className="text-fg-muted">Loading shared conversation…</p>
      </main>
    );
  }

  if (query.isError || !query.data) {
    const message =
      query.error instanceof ApiError ? query.error.message : "This share link is invalid or has been revoked.";
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-4 px-6 py-16 outline-none">
        <h1 className="text-3xl font-semibold tracking-tight">Share unavailable</h1>
        <p className="text-fg-muted">{message}</p>
        <Link to={CLIENT_ROUTES.home} className="text-sm text-accent underline-offset-4 hover:underline">
          Back to Ken
        </Link>
      </main>
    );
  }

  const { conversation } = query.data;

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-svh w-full max-w-3xl flex-col gap-6 px-6 py-12 outline-none">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Read-only shared conversation</p>
        <h1 className="text-3xl font-semibold tracking-tight">{conversation.title}</h1>
        <p className="text-sm text-fg-muted">You can view this chat. Sending messages is disabled.</p>
      </div>
      <section className="flex flex-col gap-6" aria-label="Shared messages">
        {conversation.messages.length === 0 ? (
          <p className="text-fg-muted">This conversation has no messages.</p>
        ) : (
          conversation.messages.map((message, index) => (
            <article key={`${message.createdAt}-${index}`} className={message.role === "user" ? "flex justify-end" : undefined}>
              {message.role === "user" ? (
                <div className="max-w-[85%] rounded-3xl bg-surface-muted px-4 py-3">
                  <MarkdownContent>{message.content}</MarkdownContent>
                </div>
              ) : (
                <div className="w-full">
                  <div className="mb-1 text-xs font-medium tracking-wide text-fg-muted uppercase">{APP_NAME}</div>
                  <MarkdownContent>{message.content}</MarkdownContent>
                </div>
              )}
            </article>
          ))
        )}
      </section>
    </main>
  );
}
