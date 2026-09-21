import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Bot, Library, PanelLeft, Plus, Search } from "lucide-react";
import { APP_NAME, CLIENT_ROUTES, type PublicConversation } from "@Ken/shared";
import { ConversationList } from "@/components/ConversationList";
import { KenMark } from "@/components/KenMark";
import { SidebarAccountMenu } from "@/components/SidebarAccountMenu";
import { SidebarNavLink } from "@/components/SidebarNavLink";
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
  const listRef = menuRef as RefObject<HTMLDivElement | null>;

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
          <SidebarNavLink
            to={CLIENT_ROUTES.chat}
            icon={Plus}
            label="New chat"
            collapsed={narrow}
            end
            prominent
          />
          <SidebarNavLink to={CLIENT_ROUTES.search} icon={Search} label="History" collapsed={narrow} />
          <SidebarNavLink to={CLIENT_ROUTES.library} icon={Library} label="Library" collapsed={narrow} />
          <SidebarNavLink to={CLIENT_ROUTES.gpts} icon={Bot} label="GPTs" collapsed={narrow} />
        </div>

        {/*
          `narrow` (the desktop icon-rail toggle) used to unmount this whole
          block, filter box and chat list included, with no `md:` qualifier.
          Every other consumer of `narrow` in this file only ever collapses
          at `md:` and up — this one collapsed it everywhere, so a session
          that had ever collapsed the desktop rail (the state persists in
          localStorage) lost its chat history on mobile and tablet too, with
          no way back: the un-collapse button is itself `md:`-only. The list
          now always renders; `md:hidden` keeps the desktop rail's collapsed
          look exactly as it was.
        */}
        <>
          <ConversationList
            groups={groups}
            {...(conversationId ? { conversationId } : {})}
            menuId={menuId}
            menuRef={listRef}
            renamingId={renamingId}
            renameValue={renameValue}
            loading={conversationsQuery.isLoading}
            loadError={conversationsQuery.isError}
            collapsed={narrow}
            filter={filter}
            onFilterChange={setFilter}
            onRenameValue={setRenameValue}
            onCommitRename={commitRename}
            onCancelRename={() => setRenamingId(null)}
            onToggleMenu={(id) => {
              setAccountOpen(false);
              setMenuId((current) => (current === id ? null : id));
            }}
            onStartRename={startRename}
            onTogglePin={(conversation) => {
              updateMutation.mutate({ id: conversation.id, pinned: !conversation.pinned });
              setMenuId(null);
            }}
            onCopyShare={(id) => void copyShareLink(id)}
            onExport={(id, format) => void exportChat(id, format)}
            onDelete={(id) => {
              setMenuId(null);
              if (window.confirm("Delete this conversation?")) {
                deleteMutation.mutate(id);
              }
            }}
          />
          {/* The nav above carries the layout's only `flex-1`; when `narrow`
              hides it on desktop, this stands in so the account button below
              still gets pushed to the bottom of the rail. It never renders
              below `md:`, where the real nav is always visible instead. */}
          {narrow ? <div className="hidden flex-1 md:block" /> : null}
        </>

        <SidebarAccountMenu
          collapsed={narrow}
          open={accountOpen}
          menuRef={listRef}
          {...(user?.name ? { name: user.name } : {})}
          {...(user?.email ? { email: user.email } : {})}
          isAdmin={user?.role === "admin"}
          onToggle={() => {
            setMenuId(null);
            setAccountOpen((value) => !value);
          }}
          onClose={() => setAccountOpen(false)}
          onShortcuts={() => {
            setAccountOpen(false);
            setShortcutsOpen(true);
          }}
          onLogout={() => {
            setAccountOpen(false);
            void logout();
          }}
        />
      </aside>
    </>
  );
}
