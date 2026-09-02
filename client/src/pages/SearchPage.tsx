import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES, type PublicConversation } from "@Ken/shared";
import { api } from "@/services/api";
import { CONVERSATION_STALE_MS } from "@/query";
import { useUiStore } from "@/stores/uiStore";
import { groupConversations } from "@/utils/groupConversations";

const EMPTY_CONVERSATIONS: PublicConversation[] = [];

export function SearchPage() {
  const filter = useUiStore((state) => state.chatFilter);
  const setChatFilter = useUiStore((state) => state.setChatFilter);
  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations.list(),
    staleTime: CONVERSATION_STALE_MS,
  });
  const conversations = conversationsQuery.data?.conversations ?? EMPTY_CONVERSATIONS;
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(query));
  }, [conversations, filter]);
  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">History</h1>
        <p className="text-fg-muted">
          Search and resume past conversations. Web search is the globe in the composer.
        </p>
      </div>
      <input
        type="search"
        value={filter}
        autoFocus
        onChange={(event) => setChatFilter(event.target.value)}
        placeholder="Search chats"
        aria-label="Search chats"
        className="w-full rounded-xl border border-border bg-canvas px-4 py-2.5 text-sm"
      />
      {conversationsQuery.isLoading ? <p className="text-sm text-fg-muted">Loading chats…</p> : null}
      {conversationsQuery.isError ? <p className="text-sm text-danger">Unable to load chats.</p> : null}
      {!conversationsQuery.isLoading && groups.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {filter.trim() ? "No chats match that title." : "No conversations yet."}
        </p>
      ) : null}
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.id} className="space-y-1">
            <h2 className="text-[11px] font-medium tracking-wide text-fg-muted uppercase">{group.label}</h2>
            <ul>
              {group.items.map((conversation) => (
                <li key={conversation.id}>
                  <Link
                    to={`/chat/${conversation.id}`}
                    className="chat-history-item block rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
                  >
                    {conversation.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <Link to={CLIENT_ROUTES.chat} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to chat
      </Link>
    </div>
  );
}
