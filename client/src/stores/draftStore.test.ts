import { describe, expect, it, beforeEach } from "vitest";
import { DRAFT_STORAGE_KEY, draftKey, useDraftStore } from "./draftStore";

describe("draftStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useDraftStore.setState({ drafts: {} });
  });

  it("persists unsent drafts by conversation", () => {
    useDraftStore.getState().setDraft(draftKey(), "hello from new chat");
    expect(useDraftStore.getState().drafts.new).toBe("hello from new chat");
    expect(JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) ?? "{}")).toEqual({
      new: "hello from new chat",
    });

    useDraftStore.getState().setDraft(draftKey("c1"), "later");
    useDraftStore.getState().clearDraft("new");
    expect(useDraftStore.getState().drafts.new).toBeUndefined();
    expect(useDraftStore.getState().drafts.c1).toBe("later");
  });
});
