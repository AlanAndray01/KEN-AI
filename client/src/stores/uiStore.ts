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
  keysPanelOpen: boolean;
  chatFilter: string;
  setMobileOpen: (open: boolean) => void;
  toggleCollapsed: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setKeysPanelOpen: (open: boolean) => void;
  setChatFilter: (value: string) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  mobileOpen: false,
  collapsed: readCollapsed(),
  shortcutsOpen: false,
  keysPanelOpen: false,
  chatFilter: "",
  setMobileOpen: (open) => set({ mobileOpen: open }),
  toggleCollapsed: () => {
    const collapsed = !get().collapsed;
    window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    set({ collapsed });
  },
  setShortcutsOpen: (open) => set({ shortcutsOpen: open }),
  setKeysPanelOpen: (open) => set({ keysPanelOpen: open }),
  setChatFilter: (value) => set({ chatFilter: value }),
}));
