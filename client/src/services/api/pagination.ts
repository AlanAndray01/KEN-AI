import { request } from "./client";

/** Follow server cursors so existing list consumers do not silently lose older rows. */
export async function collectPages<T>(path: string, field: string): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams(path.split("?")[1] ?? "");
    query.set("limit", "100");
    if (cursor) query.set("cursor", cursor);
    const page = await request<Record<string, unknown>>(`${path.split("?")[0]}?${query}`);
    const entries = page[field];
    if (!Array.isArray(entries)) throw new Error("Invalid list response");
    rows.push(...entries as T[]);
    cursor = typeof page.nextCursor === "string" ? page.nextCursor : undefined;
    if (cursor && seen.has(cursor)) throw new Error("List pagination did not advance");
    if (cursor) seen.add(cursor);
  } while (cursor);
  return rows;
}
