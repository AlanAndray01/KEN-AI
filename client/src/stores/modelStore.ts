import { create } from "zustand";

const STORAGE_KEY = "aether.model";

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

export const useModelStore = create<ModelState>((set) => ({
  ...readSelection(),
  setSelection: (providerId, modelId) => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ providerId, modelId }));
    set({ providerId, modelId });
  },
}));
