import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@Ken/shared";

/**
 * Appearance settings.
 *
 * KEN ships a single dark palette, so there is no theme to pick. The route is
 * kept because it is linked from the settings index and may be bookmarked; it
 * now explains the situation rather than offering a control that does nothing.
 */
export function SettingsAppearancePage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <p className="text-sm text-fg-muted">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Appearance</h1>
        <p className="text-fg-muted">Ken uses a single dark theme across the app.</p>
      </div>
      <div className="rounded-xl border border-border bg-surface px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="h-8 w-8 rounded-lg border border-border bg-canvas" aria-hidden="true" />
          <div>
            <div className="font-medium">Dark</div>
            <p className="mt-1 text-sm text-fg-muted">
              Low-glare workspace, tuned to the Ken palette.
            </p>
          </div>
        </div>
      </div>
      <Link to={CLIENT_ROUTES.settings} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to settings
      </Link>
    </div>
  );
}
