import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const update = vi.fn().mockResolvedValue({});

vi.mock("@/services/api", () => ({
  api: { me: { update: (...args: unknown[]) => update(...args) } },
}));

async function loadStore() {
  vi.resetModules();
  return import("./modelStore");
}

describe("modelStore", () => {
  beforeEach(() => {
    window.localStorage.clear();
    update.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to Auto when nothing has been saved", async () => {
    const { useModelStore } = await loadStore();
    expect(useModelStore.getState()).toMatchObject({ providerId: "auto", modelId: "auto" });
  });

  it("drops a pre-Auto selection instead of migrating it", async () => {
    window.localStorage.setItem("Ken.model", JSON.stringify({ providerId: "groq", modelId: "qwen/qwen3.6-27b" }));
    const { useModelStore } = await loadStore();
    expect(useModelStore.getState()).toMatchObject({ providerId: "auto", modelId: "auto" });
    expect(window.localStorage.getItem("Ken.model")).toBeNull();
  });

  it("saves a manual pick locally and to the account as a manual choice", async () => {
    const { useModelStore } = await loadStore();
    useModelStore.getState().setSelection("gemini", "gemini-3.1-pro-preview");

    expect(JSON.parse(window.localStorage.getItem("Ken.model.v2") ?? "{}")).toEqual({
      providerId: "gemini",
      modelId: "gemini-3.1-pro-preview",
    });
    vi.advanceTimersByTime(400);
    expect(update).toHaveBeenCalledWith({
      preferences: {
        selectionMode: "manual",
        selectedProviderId: "gemini",
        selectedModelId: "gemini-3.1-pro-preview",
      },
    });
  });

  it("records a return to Auto as an Auto choice", async () => {
    const { useModelStore } = await loadStore();
    useModelStore.getState().setSelection("auto", "auto");
    vi.advanceTimersByTime(400);
    expect(update).toHaveBeenCalledWith({
      preferences: { selectionMode: "auto", selectedProviderId: "auto", selectedModelId: "auto" },
    });
  });

  it("mirrors a thread's model without replacing the saved default", async () => {
    const { useModelStore } = await loadStore();
    useModelStore.getState().setSelection("groq", "qwen/qwen3.6-27b", { persist: false });

    expect(useModelStore.getState()).toMatchObject({ providerId: "groq" });
    expect(window.localStorage.getItem("Ken.model.v2")).toBeNull();
    vi.advanceTimersByTime(400);
    expect(update).not.toHaveBeenCalled();

    useModelStore.getState().restoreDefault();
    expect(useModelStore.getState()).toMatchObject({ providerId: "auto", modelId: "auto" });
  });

  describe("hydrateModelSelection", () => {
    it("applies an explicit manual pick from another device", async () => {
      const { hydrateModelSelection, useModelStore } = await loadStore();
      hydrateModelSelection({ selectionMode: "manual", selectedProviderId: "openai", selectedModelId: "gpt-4.1" });
      expect(useModelStore.getState()).toMatchObject({ providerId: "openai", modelId: "gpt-4.1" });
    });

    it("keeps Auto for an account whose ids were written before Auto existed", async () => {
      const { hydrateModelSelection, useModelStore } = await loadStore();
      hydrateModelSelection({ selectedProviderId: "groq", selectedModelId: "qwen/qwen3.6-27b" });
      expect(useModelStore.getState()).toMatchObject({ providerId: "auto", modelId: "auto" });
    });

    it("switches to Auto when the account chose Auto elsewhere", async () => {
      window.localStorage.setItem("Ken.model.v2", JSON.stringify({ providerId: "openai", modelId: "gpt-4.1" }));
      const { hydrateModelSelection, useModelStore } = await loadStore();
      hydrateModelSelection({ selectionMode: "auto" });
      expect(useModelStore.getState()).toMatchObject({ providerId: "auto", modelId: "auto" });
    });
  });
});
