import { Link } from "react-router-dom";
import { CLIENT_ROUTES } from "@aether/shared";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-fg-muted">{description}</p>
      <p className="text-sm text-fg-muted">
        Conversation title search is not part of v1. Filter chats in the sidebar, or use web search from the composer.
      </p>
      <Link to={CLIENT_ROUTES.chat} className="text-sm text-accent underline-offset-4 hover:underline">
        Back to chat
      </Link>
    </div>
  );
}
