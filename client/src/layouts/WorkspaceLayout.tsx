import { lazy, Suspense, useEffect } from "react";
import { Menu } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { ConversationSidebar } from "@/components/ConversationSidebar";
import { PageFallback } from "@/components/PageFallback";
import { useAuth } from "@/hooks/useAuth";
import { useUiStore } from "@/stores/uiStore";

const ShortcutsModal = lazy(() =>
  import("@/components/ShortcutsModal").then((mod) => ({ default: mod.ShortcutsModal })),
);

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
  const sendOnEnter = user?.preferences?.sendOnEnter ?? false;

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
    <div className="workspace-shell flex h-svh overflow-hidden bg-canvas">
      <ConversationSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        {isChat ? null : (
          <div className="flex items-center border-b border-border px-3 py-2 md:hidden">
            {/* This row only exists on mobile/tablet (the wrapper above is
                `md:hidden`), so the 48px target is sized directly rather
                than through a breakpoint — there is no desktop state to
                disturb. */}
            <button
              type="button"
              className="inline-flex size-12 items-center justify-center rounded-lg text-fg-muted hover:bg-surface-muted"
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
          <Suspense fallback={<PageFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      {shortcutsOpen ? (
        <Suspense fallback={null}>
          <ShortcutsModal open onClose={() => setShortcutsOpen(false)} sendOnEnter={sendOnEnter} />
        </Suspense>
      ) : null}
    </div>
  );
}
