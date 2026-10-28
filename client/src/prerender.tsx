import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { TermsPage } from "./pages/TermsPage";

// Build-time rendering only. No sessions, database, or user content is loaded.
export function renderPublicPage(path: string): string {
  const page = path === "/" ? <HomePage /> : path === "/privacy" ? <PrivacyPage /> : path === "/terms" ? <TermsPage /> : null;
  return page ? renderToStaticMarkup(<MemoryRouter initialEntries={[path]}>{page}</MemoryRouter>) : "";
}
