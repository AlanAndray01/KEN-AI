import { create } from "zustand";
import { AUTO_MODEL_ID, AUTO_PROVIDER_ID, isAutoSelection, type ModelSelectionMode } from "@Ken/shared";
import { api } from "@/services/api";

/**
 * v2 arrived with Auto as the default. The v1 key usually held a model the
 * default-model effect wrote on the user's behalf rather than one they picked,
 * so it is discarded instead of migrated: carrying it forward would keep every
 * existing user off Auto without them ever having chosen that.
 */
const STORAGE_KEY = "Ken.model.v2";
const LEGACY_STORAGE_KEY = "Ken.model";

interface ModelSelection {
  providerId: string;
  modelId: string;
}

export const AUTO_SELECTION: Readonly<ModelSelection> = {
  providerId: AUTO_PROVIDER_ID,
  modelId: AUTO_MODEL_ID,
};

interface SelectionOptions {
  /**
   * False when the picker is only mirroring an existing thread's model. Opening
   * an old conversation must not quietly replace the user's saved default.
   */
  persist?: boolean;
}

interface ModelState extends ModelSelection {
  setSelection: (providerId: string, modelId: string, options?: SelectionOptions) => void;
  /** Return the picker to the saved default, e.g. when a new chat starts. */
  restoreDefault: () => void;
}

function readSelection(): ModelSelection {
  if (typeof window === "undefined") return { ...AUTO_SELECTION };
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...AUTO_SELECTION };
    const parsed = JSON.parse(raw) as Partial<ModelSelection>;
    if (typeof parsed.providerId === "string" && parsed.providerId && typeof parsed.modelId === "string" && parsed.modelId) {
      return { providerId: parsed.providerId, modelId: parsed.modelId };
    }
  } catch {
    // Private mode, blocked storage, or an invalid payload: fall back to Auto.
  }
  return { ...AUTO_SELECTION };
}

function writeSelection(selection: ModelSelection): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // The in-memory selection still applies for this session.
  }
}

let persistTimer: number | undefined;

function persistSelection(selection: ModelSelection): void {
  if (!selection.providerId || !selection.modelId) return;
  const update = api.me?.update;
  if (typeof update !== "function") return;
  const selectionMode: ModelSelectionMode = isAutoSelection(selection.providerId, selection.modelId)
    ? "auto"
    : "manual";
  if (persistTimer) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(() => {
    void update({
      preferences: {
        selectionMode,
        selectedProviderId: selection.providerId,
        selectedModelId: selection.modelId,
      },
    }).catch(() => {
      // Preference sync is best-effort; the local selection still applies.
    });
  }, 400);
}

/**
 * Apply the account's saved picker state after sign-in.
 *
 * Only an explicit manual pick crosses devices. An account from before Auto has
 * model ids but no mode, and those ids were almost always written for the user
 * by the default-model effect, so the local default (Auto, unless a model was
 * picked on this device) is left in place.
 */
export function hydrateModelSelection(preferences?: {
  selectionMode?: ModelSelectionMode;
  selectedProviderId?: string;
  selectedModelId?: string;
}): void {
  if (!preferences) return;
  if (preferences.selectionMode === "manual" && preferences.selectedProviderId && preferences.selectedModelId) {
    const selection = { providerId: preferences.selectedProviderId, modelId: preferences.selectedModelId };
    writeSelection(selection);
    useModelStore.setState(selection);
    return;
  }
  if (preferences.selectionMode === "auto") {
    writeSelection(AUTO_SELECTION);
    useModelStore.setState({ ...AUTO_SELECTION });
  }
}

export const useModelStore = create<ModelState>((set) => ({
  ...readSelection(),
  setSelection: (providerId, modelId, options) => {
    const selection = { providerId, modelId };
    set(selection);
    if (options?.persist === false) return;
    writeSelection(selection);
    persistSelection(selection);
  },
  restoreDefault: () => set(readSelection()),
}));
