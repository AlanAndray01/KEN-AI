import { create } from "zustand";

const STORAGE_KEY = "aether.sidebarCollapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

interface UiState {
  mobileOpen: boolean;
  collapsed: boolean;
  shortcutsOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  toggleCollapsed: () => void;
  setShortcutsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  mobileOpen: false,
  collapsed: readCollapsed(),
  shortcutsOpen: false,
  setMobileOpen: (open) => set({ mobileOpen: open }),
  toggleCollapsed: () => {
    const collapsed = !get().collapsed;
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    set({ collapsed });
  },
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
}));
