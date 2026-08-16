export interface MentionCandidate {
  id: string;
  name: string;
  description?: string;
}

export function mentionTokenAt(value: string, cursor: number): { start: number; query: string } | undefined {
  const before = value.slice(0, Math.max(0, cursor));
  const match = /(?:^|[\s])@([^\s@]*)$/.exec(before);
  if (!match) return undefined;
  const atIndex = before.lastIndexOf("@");
  return { start: atIndex, query: match[1] ?? "" };
}

export function applyMention(value: string, start: number, cursor: number, name: string): string {
  const prefix = value.slice(0, start);
  const suffix = value.slice(Math.max(cursor, start));
  const needsSpace = suffix.length === 0 || !suffix.startsWith(" ");
  return `${prefix}@${name}${needsSpace ? " " : ""}${suffix}`;
}

export function filterMentions(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  const needle = query.trim().toLowerCase();
  const matched = needle
    ? candidates.filter((item) => item.name.toLowerCase().includes(needle))
    : candidates;
  return matched.slice(0, 8);
}
