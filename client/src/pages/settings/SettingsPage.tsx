import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";

const LINKS = [
  { to: CLIENT_ROUTES.settingsAccount, title: "Account", description: "Profile, password, and session security." },
  { to: CLIENT_ROUTES.settingsGeneral, title: "General", description: "Language and defaults." },
  { to: CLIENT_ROUTES.settingsAppearance, title: "Appearance", description: "Light, dark, and system themes." },
  { to: CLIENT_ROUTES.settingsPersonalization, title: "Personalization", description: "Custom instructions." },
  { to: CLIENT_ROUTES.settingsMemory, title: "Memory", description: "Saved facts the assistant can use." },
  { to: CLIENT_ROUTES.settingsVoice, title: "Voice", description: "Speech input and playback." },
  { to: CLIENT_ROUTES.settingsNotifications, title: "Notifications", description: "Alerts and email." },
  { to: CLIENT_ROUTES.settingsDataControls, title: "Data controls", description: "Export and deletion." },
  { to: CLIENT_ROUTES.settingsModels, title: "API Keys & Models", description: "Bring-your-own keys, connection tests, and the model catalog." },
];

export function SettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="text-fg-muted">
          Appearance, models, memory, share links, exports, and notifications are available from these pages.
        </p>
      </div>
      <ul className="grid gap-2">
        {LINKS.map((link) => (
          <li key={link.to}>
            <Link
              to={link.to}
              className="block rounded-xl border border-border bg-surface px-4 py-3 hover:bg-surface-muted"
            >
              <div className="font-medium">{link.title}</div>
              <p className="text-sm text-fg-muted">{link.description}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
