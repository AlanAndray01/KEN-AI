import type { PublicConversation } from "@Ken/shared";
import { describe, expect, it } from "vitest";
import { groupConversations } from "./groupConversations";

function conversation(
  id: string,
  title: string,
  at: Date,
  pinned = false,
): PublicConversation {
  const iso = at.toISOString();
  return {
    id,
    title,
    modelId: "gemini-2.5-flash",
    providerId: "gemini",
    archived: false,
    pinned,
    lastMessageAt: iso,
    messageCount: 1,
    createdAt: iso,
    updatedAt: iso,
  };
}

describe("groupConversations", () => {
  const now = new Date("2026-08-15T15:00:00.000Z");

  it("groups pinned chats first, then recency buckets", () => {
    const groups = groupConversations(
      [
        conversation("1", "Pinned", new Date("2026-07-01T00:00:00.000Z"), true),
        conversation("2", "Today", new Date("2026-08-15T12:00:00.000Z")),
        conversation("3", "Yesterday", new Date("2026-08-14T12:00:00.000Z")),
        conversation("4", "Last week", new Date("2026-08-10T12:00:00.000Z")),
        conversation("5", "Last month", new Date("2026-07-20T12:00:00.000Z")),
        conversation("6", "Ancient", new Date("2026-01-01T12:00:00.000Z")),
      ],
      now,
    );

    expect(groups.map((group) => group.id)).toEqual([
      "pinned",
      "today",
      "yesterday",
      "week",
      "month",
      "older",
    ]);
    expect(groups[0]?.items.map((item) => item.id)).toEqual(["1"]);
    expect(groups[1]?.items.map((item) => item.title)).toEqual(["Today"]);
    expect(groups[5]?.items.map((item) => item.title)).toEqual(["Ancient"]);
  });

  it("omits empty groups", () => {
    const groups = groupConversations(
      [conversation("2", "Today", new Date("2026-08-15T12:00:00.000Z"))],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.id).toBe("today");
  });
});
