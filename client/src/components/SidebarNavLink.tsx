import { NavLink } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/utils/cn";

export function SidebarNavLink({
  to,
  icon: Icon,
  label,
  collapsed,
  end = false,
  prominent = false,
}: {
  to: string;
  icon: LucideIcon;
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
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted",
          collapsed && "md:justify-center md:px-2",
          prominent && "border border-border",
          // One active style across the sidebar: muted pill + 2px green bar.
          isActive && !prominent && "bg-surface-muted font-medium shadow-[inset_2px_0_0_var(--color-accent)]",
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      <span className={cn(collapsed && "md:hidden")}>{label}</span>
    </NavLink>
  );
}
