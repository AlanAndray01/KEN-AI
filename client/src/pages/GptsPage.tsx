import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import { CLIENT_ROUTES, GPT_CATEGORIES, type GptCategory, type PublicCustomGpt } from "@aether/shared";
import { api } from "@/services/api";

export function GptsPage() {
  const [scope, setScope] = useState<"mine" | "explore">("explore");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GptCategory | "">("");
  const gptsQuery = useQuery({
    queryKey: ["gpts", scope, query, category],
    queryFn: () =>
      api.gpts.list({
        scope,
        ...(query.trim() ? { q: query.trim() } : {}),
        ...(category ? { category } : {}),
      }),
  });
  const gpts = gptsQuery.data?.gpts ?? [];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">GPTs</h1>
          <p className="text-fg-muted">Explore public GPTs or manage the ones you created. Type @ in chat to mention them.</p>
        </div>
        <Link
          to={CLIENT_ROUTES.gptCreate}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg"
        >
          Create a GPT
        </Link>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm ${scope === "explore" ? "bg-surface" : "text-fg-muted"}`}
          onClick={() => setScope("explore")}
        >
          Explore
        </button>
        <button
          type="button"
          className={`rounded-lg px-3 py-1.5 text-sm ${scope === "mine" ? "bg-surface" : "text-fg-muted"}`}
          onClick={() => setScope("mine")}
        >
          My GPTs
        </button>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search GPTs"
          aria-label="Search GPTs"
          className="rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm"
        />
        <select
          value={category}
          aria-label="Category"
          onChange={(event) => setCategory(event.target.value as GptCategory | "")}
          className="rounded-lg border border-border bg-canvas px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {GPT_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      {gptsQuery.isLoading ? <p className="text-fg-muted">Loading GPTs…</p> : null}
      {gpts.length === 0 && !gptsQuery.isLoading ? (
        <p className="text-sm text-fg-muted">
          {scope === "mine" ? "You have not created a GPT yet." : "No public GPTs yet."}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {gpts.map((gpt) => (
            <GptCard key={gpt.id} gpt={gpt} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GptCard({ gpt }: { gpt: PublicCustomGpt }) {
  return (
    <li>
      <Link
        to={`/gpts/${gpt.id}`}
        className="block h-full rounded-xl border border-border bg-surface px-4 py-4 hover:bg-surface-muted"
      >
        <div className="font-medium">{gpt.name}</div>
        <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{gpt.description || "No description"}</p>
        <p className="mt-2 text-xs text-fg-muted">
          {gpt.category} · {gpt.visibility}
          {gpt.mine ? " · yours" : ""}
        </p>
      </Link>
    </li>
  );
}
