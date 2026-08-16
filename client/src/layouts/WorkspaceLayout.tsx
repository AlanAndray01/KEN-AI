import { useEffect } from "react";
import { Menu } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { ShortcutsModal } from "@/components/ShortcutsModal";
import { useAuth } from "@/hooks/useAuth";
import { useUiStore } from "@/stores/uiStore";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function WorkspaceLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const setMobileOpen = useUiStore((state) => state.setMobileOpen);
  const shortcutsOpen = useUiStore((state) => state.shortcutsOpen);
  const setShortcutsOpen = useUiStore((state) => state.setShortcutsOpen);
  const isChat = location.pathname === "/chat" || location.pathname.startsWith("/chat/");
  const sendOnEnter = user?.preferences?.sendOnEnter ?? true;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const meta = event.ctrlKey || event.metaKey;
      if (event.key === "Escape") {
        if (shortcutsOpen) {
          event.preventDefault();
          setShortcutsOpen(false);
        }
        return;
      }
      if ((event.key === "?" && !meta && !isTypingTarget(event.target)) || (meta && event.key === "/")) {
        event.preventDefault();
        setShortcutsOpen(!shortcutsOpen);
        return;
      }
      if (!meta) return;
      if (event.key.toLowerCase() === "o" && event.shiftKey) {
        event.preventDefault();
        void navigate(CLIENT_ROUTES.chat);
        return;
      }
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        void navigate(CLIENT_ROUTES.search);
        return;
      }
      if (event.key === ",") {
        event.preventDefault();
        void navigate(CLIENT_ROUTES.settings);
        return;
      }
      if (event.key.toLowerCase() === "l" && event.shiftKey) {
        event.preventDefault();
        document.getElementById("composer-input")?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, setShortcutsOpen, shortcutsOpen]);

  return (
    <div className="flex h-svh overflow-hidden bg-canvas">
      <ConversationSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {isChat ? null : (
          <div className="flex items-center border-b border-border px-3 py-2 md:hidden">
            <button
              type="button"
              className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted"
              aria-label="Open sidebar"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </button>
          </div>
        )}
        <main
          id="main-content"
          tabIndex={-1}
          className={
            isChat
              ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none"
              : "min-h-0 min-w-0 flex-1 overflow-y-auto outline-none"
          }
        >
          <Outlet />
        </main>
      </div>
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} sendOnEnter={sendOnEnter} />
    </div>
  );
}
