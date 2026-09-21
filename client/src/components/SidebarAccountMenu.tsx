import { Link } from "react-router-dom";
import { CircleUser, Keyboard, LogOut, Monitor, Settings, Shield, SlidersHorizontal } from "lucide-react";
import type { RefObject } from "react";
import { CLIENT_ROUTES } from "@Ken/shared";
import { cn } from "@/utils/cn";

export function SidebarAccountMenu({
  collapsed,
  open,
  menuRef,
  name,
  email,
  isAdmin,
  onToggle,
  onClose,
  onShortcuts,
  onLogout,
}: {
  collapsed: boolean;
  open: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  name?: string;
  email?: string;
  isAdmin: boolean;
  onToggle: () => void;
  onClose: () => void;
  onShortcuts: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="relative border-t border-border p-2" ref={open ? menuRef : undefined}>
      <button
        type="button"
        className={cn(
          "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-muted",
          collapsed && "md:justify-center",
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        {...(collapsed ? { "aria-label": "Account menu" } : {})}
        onClick={onToggle}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-medium">
          {(name ?? "A").slice(0, 1).toUpperCase()}
        </span>
        {!collapsed ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate">{name}</span>
            <span className="block truncate text-xs text-fg-muted">{email}</span>
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute bottom-full left-2 z-20 mb-2 w-56 rounded-xl border border-border bg-surface py-1 shadow-lg",
            collapsed && "md:left-full md:bottom-2 md:mb-0 md:ml-2",
          )}
        >
          <Link
            role="menuitem"
            to={CLIENT_ROUTES.settingsAccount}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={onClose}
          >
            <CircleUser className="size-4" />
            Profile
          </Link>
          <Link
            role="menuitem"
            to={CLIENT_ROUTES.settingsPersonalization}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={onClose}
          >
            <SlidersHorizontal className="size-4" />
            Personalization
          </Link>
          <Link
            role="menuitem"
            to={CLIENT_ROUTES.settings}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={onClose}
          >
            <Settings className="size-4" />
            Settings
          </Link>
          <Link
            role="menuitem"
            to={CLIENT_ROUTES.settingsAppearance}
            className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={onClose}
          >
            <Monitor className="size-4" />
            Appearance
          </Link>
          {isAdmin ? (
            <Link
              role="menuitem"
              to={CLIENT_ROUTES.adminProviders}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
              onClick={onClose}
            >
              <Shield className="size-4" />
              Admin
            </Link>
          ) : null}
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={onShortcuts}
          >
            <Keyboard className="size-4" />
            Keyboard shortcuts
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-surface-muted"
            onClick={onLogout}
          >
            <LogOut className="size-4" />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
