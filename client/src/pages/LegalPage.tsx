import { Link } from "react-router-dom";
import { APP_NAME, CLIENT_ROUTES } from "@Ken/shared";

/**
 * Shared shell for the public legal pages.
 *
 * These are reachable signed out: Google's OAuth consent screen links to them,
 * and someone deciding whether to register has to be able to read the terms
 * before they hand over an email address.
 */

interface LegalPageProps {
  title: string;
  updated: string;
  children: React.ReactNode;
}

export function LegalPage({ title, updated, children }: LegalPageProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16 outline-none"
    >
      <header className="flex flex-col gap-2">
        <Link
          to={CLIENT_ROUTES.home}
          className="text-sm text-accent underline-offset-4 hover:underline"
        >
          ← {APP_NAME}
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-fg-muted">Last updated {updated}</p>
      </header>

      <div className="markdown flex flex-col gap-6 text-fg-muted">{children}</div>

      <footer className="border-t border-border pt-6 text-sm text-fg-muted">
        <p>
          Questions about this page? Email{" "}
          <a
            href="mailto:support@ken-ai.tech"
            className="text-accent underline-offset-4 hover:underline"
          >
            support@ken-ai.tech
          </a>
          .
        </p>
        <p className="mt-2 flex gap-4">
          <Link to={CLIENT_ROUTES.privacy} className="underline-offset-4 hover:underline">
            Privacy
          </Link>
          <Link to={CLIENT_ROUTES.terms} className="underline-offset-4 hover:underline">
            Terms
          </Link>
        </p>
      </footer>
    </main>
  );
}

/** Section heading used by both legal pages, so their rhythm stays identical. */
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-lg font-semibold text-fg">{heading}</h2>
      {children}
    </section>
  );
}
