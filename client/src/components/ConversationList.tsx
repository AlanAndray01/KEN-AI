import { Link } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import type { RefObject } from "react";
import type { PublicConversation } from "@Ken/shared";
import { ConversationItemMenu } from "@/components/ConversationItemMenu";
import { cn } from "@/utils/cn";
import type { ConversationGroup } from "@/utils/groupConversations";

export function ConversationList({
  groups,
  conversationId,
  menuId,
  menuRef,
  renamingId,
  renameValue,
  loading,
  loadError,
  collapsed,
  filter,
  onFilterChange,
  onRenameValue,
  onCommitRename,
  onCancelRename,
  onToggleMenu,
  onStartRename,
  onTogglePin,
  onCopyShare,
  onExport,
  onDelete,
}: {
  groups: ConversationGroup[];
  conversationId?: string;
  menuId: string | null;
  menuRef: RefObject<HTMLDivElement | null>;
  renamingId: string | null;
  renameValue: string;
  loading: boolean;
  loadError: boolean;
  collapsed: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onRenameValue: (value: string) => void;
  onCommitRename: (id: string) => void;
  onCancelRename: () => void;
  onToggleMenu: (id: string) => void;
  onStartRename: (conversation: PublicConversation) => void;
  onTogglePin: (conversation: PublicConversation) => void;
  onCopyShare: (id: string) => void;
  onExport: (id: string, format: "md" | "json" | "txt") => void;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      <div className={cn("px-3 pt-3 pb-2", collapsed && "md:hidden")}>
        <input
          type="search"
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Filter chats"
          aria-label="Filter chats"
          className="w-full rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm"
        />
      </div>
      <nav
        className={cn("flex-1 space-y-4 overflow-y-auto px-2 pb-4", collapsed && "md:hidden")}
        aria-label="Conversations"
      >
        {loading ? <p className="px-2 text-xs text-fg-muted">Loading chats…</p> : null}
        {loadError ? <p className="px-2 text-xs text-danger">Unable to load chats.</p> : null}
        {groups.length === 0 && !loading ? (
          <p className="px-2 text-xs text-fg-muted">No conversations yet.</p>
        ) : null}
        {groups.map((group) => (
          <section key={group.id} className="space-y-1">
            <h2 className="px-2 text-[11px] font-medium tracking-wide text-fg-muted uppercase">
              {group.label}
            </h2>
            {group.items.map((conversation) => {
              const active = conversation.id === conversationId;
              const renaming = renamingId === conversation.id;
              return (
                <div
                  key={conversation.id}
                  className="relative"
                  ref={menuId === conversation.id ? menuRef : undefined}
                >
                  {renaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      aria-label="Conversation title"
                      className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
                      onChange={(event) => onRenameValue(event.target.value)}
                      onBlur={() => onCommitRename(conversation.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onCommitRename(conversation.id);
                        if (event.key === "Escape") onCancelRename();
                      }}
                    />
                  ) : (
                    <div
                      className={cn(
                        "group flex items-center rounded-lg",
                        active
                          ? "bg-accent/10 shadow-[inset_2px_0_0_var(--color-accent)]"
                          : "hover:bg-surface-muted",
                      )}
                    >
                      <Link
                        to={`/chat/${conversation.id}`}
                        className={cn(
                          "min-w-0 flex-1 truncate px-3 py-2 text-sm",
                          active ? "font-medium text-fg" : "text-fg-muted group-hover:text-fg",
                        )}
                        title={conversation.title}
                      >
                        {conversation.title}
                      </Link>
                      <button
                        type="button"
                        className="mr-1 rounded-md p-1 text-fg-muted opacity-0 hover:bg-canvas group-hover:opacity-100 focus:opacity-100"
                        aria-label="Conversation actions"
                        aria-haspopup="menu"
                        aria-expanded={menuId === conversation.id}
                        onClick={() => onToggleMenu(conversation.id)}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    </div>
                  )}
                  {menuId === conversation.id ? (
                    <ConversationItemMenu
                      conversation={conversation}
                      onRename={() => onStartRename(conversation)}
                      onTogglePin={() => onTogglePin(conversation)}
                      onCopyShare={() => onCopyShare(conversation.id)}
                      onExport={(format) => onExport(conversation.id, format)}
                      onDelete={() => onDelete(conversation.id)}
                    />
                  ) : null}
                </div>
              );
            })}
          </section>
        ))}
      </nav>
    </>
  );
}
