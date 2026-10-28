import { create } from "zustand";

export const DRAFT_STORAGE_KEY = "Ken.drafts";

function storageKey(ownerId: string): string {
  return `${DRAFT_STORAGE_KEY}:${ownerId}`;
}

function readDrafts(ownerId: string | null): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    // Legacy drafts have no owner, so assigning them to the next login is unsafe.
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    if (!ownerId) return {};
    const raw = window.localStorage.getItem(storageKey(ownerId));
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
  ownerId: string | null;
  setOwner: (ownerId: string | null) => void;
  drafts: Record<string, string>;
  setDraft: (key: string, content: string) => void;
  clearDraft: (key: string) => void;
}

export const useDraftStore = create<DraftState>((set, get) => ({
  ownerId: null,
  drafts: {},
  setOwner: (ownerId) => {
    if (ownerId !== get().ownerId) set({ ownerId, drafts: readDrafts(ownerId) });
  },
  setDraft: (key, content) => {
    const drafts = { ...get().drafts };
    if (content.trim().length === 0) {
      delete drafts[key];
    } else {
      drafts[key] = content;
    }
    persistDrafts(get().ownerId, drafts);
    set({ drafts });
  },
  clearDraft: (key) => {
    const drafts = { ...get().drafts };
    delete drafts[key];
    persistDrafts(get().ownerId, drafts);
    set({ drafts });
  },
}));

function persistDrafts(ownerId: string | null, drafts: Record<string, string>): void {
  if (!ownerId) return;
  try {
    window.localStorage.setItem(storageKey(ownerId), JSON.stringify(drafts));
  } catch {
    // Blocked storage must not prevent editing the in-memory draft.
  }
}

export function draftKey(conversationId?: string): string {
  return conversationId ?? "new";
}
