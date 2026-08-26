import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

// jsdom has no layout engine and therefore no ResizeObserver. Components that
// measure themselves need the constructor to exist; it never fires here, so they
// keep whatever they computed on their first synchronous read.
if (!("ResizeObserver" in globalThis)) {
  class ResizeObserverStub implements ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  Object.defineProperty(globalThis, "ResizeObserver", {
    writable: true,
    configurable: true,
    value: ResizeObserverStub,
  });
}

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: async () => undefined,
  },
});

// jsdom does not implement layout, so scrolling is a no-op in tests.
Element.prototype.scrollIntoView = () => undefined;
