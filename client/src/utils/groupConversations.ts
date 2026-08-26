import type { PublicConversation } from "@Ken/shared";

export interface ConversationGroup {
  id: "pinned" | "today" | "yesterday" | "week" | "month" | "older";
  label: string;
  items: PublicConversation[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function timestamp(conversation: PublicConversation): number {
  return new Date(conversation.lastMessageAt ?? conversation.updatedAt).getTime();
}

function startOfDay(now: Date): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function sortByRecent(items: PublicConversation[]): PublicConversation[] {
  return [...items].sort((left, right) => timestamp(right) - timestamp(left));
}

export function groupConversations(
  conversations: PublicConversation[],
  now: Date = new Date(),
): ConversationGroup[] {
  const pinned = sortByRecent(conversations.filter((conversation) => conversation.pinned));
  const unpinned = conversations.filter((conversation) => !conversation.pinned);

  const todayStart = startOfDay(now);
  const yesterdayStart = todayStart - DAY_MS;
  const weekStart = todayStart - 7 * DAY_MS;
  const monthStart = todayStart - 30 * DAY_MS;

  const buckets: Record<Exclude<ConversationGroup["id"], "pinned">, PublicConversation[]> = {
    today: [],
    yesterday: [],
    week: [],
    month: [],
    older: [],
  };

  for (const conversation of unpinned) {
    const time = timestamp(conversation);
    if (time >= todayStart) {
      buckets.today.push(conversation);
    } else if (time >= yesterdayStart) {
      buckets.yesterday.push(conversation);
    } else if (time >= weekStart) {
      buckets.week.push(conversation);
    } else if (time >= monthStart) {
      buckets.month.push(conversation);
    } else {
      buckets.older.push(conversation);
    }
  }

  const groups: ConversationGroup[] = [];
  if (pinned.length > 0) {
    groups.push({ id: "pinned", label: "Pinned", items: pinned });
  }

  const rest: Array<[Exclude<ConversationGroup["id"], "pinned">, string]> = [
    ["today", "Today"],
    ["yesterday", "Yesterday"],
    ["week", "Previous 7 days"],
    ["month", "Previous 30 days"],
    ["older", "Older"],
  ];

  for (const [id, label] of rest) {
    const items = sortByRecent(buckets[id]);
    if (items.length > 0) {
      groups.push({ id, label, items });
    }
  }

  return groups;
}
