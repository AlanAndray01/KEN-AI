import { NavLink } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { cn } from "@/utils/cn";

const TABS = [
  { to: CLIENT_ROUTES.login, label: "Sign in" },
  { to: CLIENT_ROUTES.register, label: "Sign up" },
  { to: CLIENT_ROUTES.forgotPassword, label: "Forgot password" },
] as const;

export function AuthModeNav() {
  return (
    <nav className="flex rounded-full bg-surface-muted p-1" aria-label="Account">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              "flex-1 rounded-full px-2 py-1.5 text-center text-xs font-medium transition-colors sm:text-sm",
              isActive ? "bg-surface text-fg shadow-sm" : "text-fg-muted hover:text-fg",
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
