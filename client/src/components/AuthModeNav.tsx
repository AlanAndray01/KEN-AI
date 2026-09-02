import { NavLink } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";
import { cn } from "@/utils/cn";

const TABS = [
  { to: CLIENT_ROUTES.login, label: "Sign in" },
  { to: CLIENT_ROUTES.register, label: "Sign up" },
  { to: CLIENT_ROUTES.forgotPassword, label: "Forgot password", compact: "Forgot" },
] as const;

export function AuthModeNav() {
  return (
    <nav className="auth-mode-nav flex w-full rounded-full p-1" aria-label="Account">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          aria-label={tab.label}
          className={({ isActive }) =>
            cn(
              "flex-1 rounded-full px-1.5 py-1.5 text-center transition-colors sm:px-2",
              isActive ? "auth-mode-tab-on text-accent" : "text-fg-muted hover:text-fg",
            )
          }
        >
          <span className="auth-tab-full">{tab.label}</span>
          {"compact" in tab ? (
            <span className="auth-tab-compact" aria-hidden="true">
              {tab.compact}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}
