import { create } from "zustand";

export const DRAFT_STORAGE_KEY = "aether.drafts";

function readDrafts(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const drafts: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value.length > 0) {
        drafts[key] = value;
      }
    }
    return drafts;
  } catch {
    return {};
  }
}

interface DraftState {
  drafts: Record<string, string>;
  setDraft: (key: string, content: string) => void;
  clearDraft: (key: string) => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  drafts: readDrafts(),
  setDraft: (key, content) => {
    const drafts = { ...get().drafts };
    if (content.trim().length === 0) {
      delete drafts[key];
    } else {
      drafts[key] = content;
    }
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    set({ drafts });
  },
  clearDraft: (key) => {
    const drafts = { ...get().drafts };
    delete drafts[key];
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts));
    set({ drafts });
  },
}));

export function draftKey(conversationId?: string): string {
  return conversationId ?? "new";
}
