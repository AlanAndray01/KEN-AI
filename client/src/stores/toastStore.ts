import { create } from "zustand";

export type ToastTone = "info" | "success" | "error";

export interface ToastItem {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, tone?: ToastTone) => string;
  dismiss: (id: string) => void;
}

const DISMISS_MS = 4_000;

function createToastId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (message, tone = "info") => {
    const id = createToastId();
    set({ toasts: [...get().toasts, { id, message, tone }] });
    window.setTimeout(() => {
      get().dismiss(id);
    }, DISMISS_MS);
    return id;
  },
  dismiss: (id) => {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },
}));

export function toast(message: string, tone: ToastTone = "info"): string {
  return useToastStore.getState().push(message, tone);
}
