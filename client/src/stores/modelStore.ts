import { create } from "zustand";
import { api } from "@/services/api";

const STORAGE_KEY = "Ken.model";

interface ModelSelection {
  providerId: string;
  modelId: string;
}

interface ModelState extends ModelSelection {
  setSelection: (providerId: string, modelId: string) => void;
}

function readSelection(): ModelSelection {
  if (typeof window === "undefined") {
    return { providerId: "", modelId: "" };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { providerId: "", modelId: "" };
    }
    const parsed = JSON.parse(raw) as Partial<ModelSelection>;
    if (typeof parsed.providerId === "string" && typeof parsed.modelId === "string") {
      return { providerId: parsed.providerId, modelId: parsed.modelId };
    }
  } catch {
    // Ignore invalid localStorage payloads.
  }

  return { providerId: "", modelId: "" };
}

function writeSelection(providerId: string, modelId: string): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ providerId, modelId }));
}

let persistTimer: number | undefined;

function persistSelection(providerId: string, modelId: string): void {
  if (!providerId || !modelId) return;
  const update = api.me?.update;
  if (typeof update !== "function") return;
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void update({ preferences: { selectedProviderId: providerId, selectedModelId: modelId } }).catch(() => {
      // Preference sync is best-effort; the local selection still applies.
    });
  }, 400);
}

export function hydrateModelSelection(providerId?: string, modelId?: string): void {
  if (!providerId || !modelId) return;
  writeSelection(providerId, modelId);
  useModelStore.setState({ providerId, modelId });
}

export const useModelStore = create<ModelState>((set) => ({
  ...readSelection(),
  setSelection: (providerId, modelId) => {
    writeSelection(providerId, modelId);
    set({ providerId, modelId });
    persistSelection(providerId, modelId);
  },
}));
