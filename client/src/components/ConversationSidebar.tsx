import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  CircleUser,
  Download,
  Keyboard,
  Library,
  Link2,
  LogOut,
  Monitor,
  MoreHorizontal,
  PanelLeft,
  Pencil,
  Pin,
  Plus,
  Search,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Trash2,
} from "lucide-react";
import { APP_NAME, CLIENT_ROUTES, type PublicConversation } from "@Ken/shared";
import { KenMark } from "@/components/KenMark";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, api } from "@/services/api";
import { CONVERSATION_STALE_MS } from "@/query";
import { toast } from "@/stores/toastStore";
import { useUiStore } from "@/stores/uiStore";
import { downloadBlob } from "@/utils/download";
import { cn } from "@/utils/cn";
import { groupConversations } from "@/utils/groupConversations";

export function ConversationSidebar() {
  const { conversationId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const collapsed = useUiStore((state) => state.collapsed);
  const mobileOpen = useUiStore((state) => state.mobileOpen);
  const setMobileOpen = useUiStore((state) => state.setMobileOpen);
  const toggleCollapsed = useUiStore((state) => state.toggleCollapsed);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const filter = useUiStore((state) => state.chatFilter);
  const setFilter = useUiStore((state) => state.setChatFilter);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [accountOpen, setAccountOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const conversationsQuery = useQuery({
    queryKey: ["conversations"],
    queryFn: () => api.conversations.list(),
    staleTime: CONVERSATION_STALE_MS,
  });

  const conversations = useMemo(
    () => conversationsQuery.data?.conversations ?? [],
    [conversationsQuery.data?.conversations],
  );
  const filtered = useMemo(() => {
    const query = filter.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(query));
  }, [conversations, filter]);
  const groups = useMemo(() => groupConversations(filtered), [filtered]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, setMobileOpen]);

  useEffect(() => {
    if (!menuId && !accountOpen) return;

    function onPointerDown(event: PointerEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuId(null);
        setAccountOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        setMenuId(null);
        setAccountOpen(false);
      }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [accountOpen, menuId]);

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; title?: string; pinned?: boolean; archived?: boolean }) => {
      const body: { title?: string; pinned?: boolean; archived?: boolean } = {};
      if (input.title !== undefined) body.title = input.title;
      if (input.pinned !== undefined) body.pinned = input.pinned;
      if (input.archived !== undefined) body.archived = input.archived;
      return api.conversations.update(input.id, body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to update conversation", "error");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.conversations.remove(id),
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast("Conversation deleted", "success");
      if (id === conversationId) {
        void navigate(CLIENT_ROUTES.chat);
      }
    },
    onError: (err: unknown) => {
      toast(err instanceof ApiError ? err.message : "Unable to delete conversation", "error");
    },
  });

  function startRename(conversation: PublicConversation): void {
    setRenamingId(conversation.id);
    setRenameValue(conversation.title);
    setMenuId(null);
  }

  async function copyShareLink(id: string): Promise<void> {
    setMenuId(null);
    try {
      const existing = await api.conversations.share.get(id);
      const share = existing.share ?? (await api.conversations.share.create(id)).share;
      await navigator.clipboard.writeText(share.url);
      toast("Read-only share link copied", "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to create share link", "error");
    }
  }

  async function exportChat(id: string, format: "md" | "json" | "txt"): Promise<void> {
    setMenuId(null);
    try {
      const file = await api.conversations.export(id, format);
      downloadBlob(file.blob, file.filename);
      toast(`Exported as ${format.toUpperCase()}`, "success");
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to export conversation", "error");
    }
  }

  function commitRename(id: string): void {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    updateMutation.mutate({ id, title });
  }

  const narrow = collapsed;

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          aria-label="Close sidebar"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}
      <aside
        aria-label="Workspace"
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex h-full flex-col border-r border-border bg-sidebar transition-transform md:static md:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          narrow ? "w-72 md:w-[4.5rem]" : "w-72",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1 px-3 py-3",
            // Collapsed, the rail is 4.5rem wide: the mark sits above the
            // toggle rather than competing with it for the same row.
            narrow && "md:flex-col md:gap-2 md:px-2",
          )}
        >
          <Link
            to={CLIENT_ROUTES.chat}
            className={cn("flex items-center px-1", narrow ? "md:justify-center md:px-0" : "flex-1")}
            aria-label={`${APP_NAME} home`}
          >
            <KenMark
              withWordmark
              className={cn("h-7 w-7", narrow && "md:h-8 md:w-8")}
              wordmarkClassName={cn(narrow && "md:hidden")}
            />
          </Link>
          {!narrow ? (
            <button
              type="button"
              className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg"
              aria-label="Search chats"
              onClick={() => void navigate(CLIENT_ROUTES.search)}
            >
              <Search className="size-4" />
            </button>
          ) : null}
          <button
            type="button"
            className="hidden rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg md:inline-flex"
            aria-label={narrow ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            <PanelLeft className="size-4" />
          </button>
        </div>

        <div className="space-y-1 px-2">
          <SidebarLink
            to={CLIENT_ROUTES.chat}
            icon={Plus}
            label="New chat"
            collapsed={narrow}
            end
            prominent
          />
          <SidebarLink to={CLIENT_ROUTES.search} icon={Search} label="History" collapsed={narrow} />
          <SidebarLink to={CLIENT_ROUTES.library} icon={Library} label="Library" collapsed={narrow} />
          <SidebarLink to={CLIENT_ROUTES.gpts} icon={Sparkles} label="GPTs" collapsed={narrow} />
        </div>

        {!narrow ? (
          <>
            <div className="px-3 pt-3 pb-2">
              <input
                type="search"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter chats"
                aria-label="Filter chats"
                className="w-full rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm"
              />
            </div>
            <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-4" aria-label="Conversations">
              {conversationsQuery.isLoading ? (
                <p className="px-2 text-xs text-fg-muted">Loading chats…</p>
              ) : null}
              {conversationsQuery.isError ? (
                <p className="px-2 text-xs text-danger">Unable to load chats.</p>
              ) : null}
              {groups.length === 0 && !conversationsQuery.isLoading ? (
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
                      <div key={conversation.id} className="relative" ref={menuId === conversation.id ? menuRef : undefined}>
                        {renaming ? (
                          <input
                            autoFocus
                            value={renameValue}
                            aria-label="Conversation title"
                            className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-sm"
                            onChange={(event) => setRenameValue(event.target.value)}
                            onBlur={() => commitRename(conversation.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") commitRename(conversation.id);
                              if (event.key === "Escape") setRenamingId(null);
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
                              onClick={() => {
                                setAccountOpen(false);
                                setMenuId((current) => (current === conversation.id ? null : conversation.id));
                              }}
                            >
                              <MoreHorizontal className="size-4" />
                            </button>
                          </div>
                        )}
                        {menuId === conversation.id ? (
                          <div className="absolute top-full right-1 z-10 mt-1 w-52 rounded-lg border border-border bg-surface py-1 shadow-lg">
                            <MenuButton
                              icon={Pencil}
                              label="Rename"
                              onClick={() => startRename(conversation)}
                            />
                            <MenuButton
                              icon={Pin}
                              label={conversation.pinned ? "Unpin" : "Pin"}
                              onClick={() => {
                                updateMutation.mutate({ id: conversation.id, pinned: !conversation.pinned });
                                setMenuId(null);
                              }}
                            />
                            <MenuButton
                              icon={Link2}
                              label="Copy share link"
                              onClick={() => void copyShareLink(conversation.id)}
                            />
                            <MenuButton
                              icon={Share2}
                              label="Export Markdown"
                              onClick={() => void exportChat(conversation.id, "md")}
                            />
                            <MenuButton
                              icon={Download}
                              label="Export JSON"
                              onClick={() => void exportChat(conversation.id, "json")}
                            />
                            <MenuButton
                              icon={Download}
                              label="Export TXT"
                              onClick={() => void exportChat(conversation.id, "txt")}
                            />
                            <MenuButton
                              icon={Trash2}
                              label="Delete"
                              danger
                              onClick={() => {
                                setMenuId(null);
                                if (window.confirm("Delete this conversation?")) {
                                  deleteMutation.mutate(conversation.id);
                                }
                              }}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </section>
              ))}
            </nav>
          </>
        ) : (
          <div className="flex-1" />
        )}

        <div className="relative border-t border-border p-2" ref={accountOpen ? menuRef : undefined}>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-muted",
              narrow && "md:justify-center",
            )}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            {...(narrow ? { "aria-label": "Account menu" } : {})}
            onClick={() => {
              setMenuId(null);
              setAccountOpen((value) => !value);
            }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-medium">
              {(user?.name ?? "A").slice(0, 1).toUpperCase()}
            </span>
            {!narrow ? (
              <span className="min-w-0 flex-1">
                <span className="block truncate">{user?.name}</span>
                <span className="block truncate text-xs text-fg-muted">{user?.email}</span>
              </span>
            ) : null}
          </button>
          {accountOpen ? (
            <div
              role="menu"
              className={cn(
                "absolute bottom-full left-2 z-20 mb-2 w-56 rounded-xl border border-border bg-surface py-1 shadow-lg",
                narrow && "md:left-full md:bottom-2 md:mb-0 md:ml-2",
              )}
            >
              <Link
                role="menuitem"
                to={CLIENT_ROUTES.settingsAccount}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                onClick={() => setAccountOpen(false)}
              >
                <CircleUser className="size-4" />
                Profile
              </Link>
              <Link
                role="menuitem"
                to={CLIENT_ROUTES.settingsPersonalization}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                onClick={() => setAccountOpen(false)}
              >
                <Sparkles className="size-4" />
                Personalization
              </Link>
              <Link
                role="menuitem"
                to={CLIENT_ROUTES.settings}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                onClick={() => setAccountOpen(false)}
              >
                <Settings className="size-4" />
                Settings
              </Link>
              <Link
                role="menuitem"
                to={CLIENT_ROUTES.settingsAppearance}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                onClick={() => setAccountOpen(false)}
              >
                <Monitor className="size-4" />
                Appearance
              </Link>
              {user?.role === "admin" ? (
                <Link
                  role="menuitem"
                  to={CLIENT_ROUTES.adminProviders}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                  onClick={() => setAccountOpen(false)}
                >
                  <Shield className="size-4" />
                  Admin
                </Link>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                onClick={() => {
                  setAccountOpen(false);
                  setShortcutsOpen(true);
                }}
              >
                <Keyboard className="size-4" />
                Keyboard shortcuts
              </button>
              <button
                type="button"
                role="menuitem"
                className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
                onClick={() => {
                  setAccountOpen(false);
                  void logout();
                }}
              >
                <LogOut className="size-4" />
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

function SidebarLink({
  to,
  icon: Icon,
  label,
  collapsed,
  end = false,
  prominent = false,
}: {
  to: string;
  icon: typeof Plus;
  label: string;
  collapsed: boolean;
  end?: boolean;
  prominent?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-2 rounded-full px-3 py-2 text-sm hover:bg-surface-muted",
          collapsed && "md:justify-center md:px-2",
          prominent && "bg-surface-muted",
          isActive && !prominent && "bg-surface",
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn(collapsed && "md:hidden")}>{label}</span>
    </NavLink>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: typeof Pencil;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted",
        danger && "text-danger",
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
