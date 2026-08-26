import { render, screen } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThinkingPipeline } from "./ThinkingPipeline";

describe("ThinkingPipeline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exposes a polite generating status for screen readers", () => {
    render(<ThinkingPipeline />);
    const status = screen.getByRole("status", { name: "Generating response" });
    expect(status).toBeInTheDocument();
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders three dots beside a waiting word", () => {
    const { container } = render(<ThinkingPipeline />);
    expect(container.querySelectorAll(".thinking-dot")).toHaveLength(3);
    expect(container.querySelector(".thinking-word")?.textContent).toBe("Thinking");
  });

  it("rotates the word while the wait continues", () => {
    const { container } = render(<ThinkingPipeline />);
    const first = container.querySelector(".thinking-word")?.textContent;
    act(() => {
      vi.advanceTimersByTime(2400);
    });
    const second = container.querySelector(".thinking-word")?.textContent;
    expect(second).not.toBe(first);
    expect(second).toBeTruthy();
  });

  it("claims no analysis stages it cannot observe", () => {
    // An earlier version cycled "Style / Format / Check" on a timer with no link
    // to the request. Playful synonyms for waiting are fine; naming a step the
    // model is supposedly on is not, so those stage names stay banned.
    const { container } = render(<ThinkingPipeline />);
    for (let tick = 0; tick < 10; tick += 1) {
      expect(["Style", "Format", "Check"]).not.toContain(
        container.querySelector(".thinking-word")?.textContent,
      );
      act(() => {
        vi.advanceTimersByTime(2400);
      });
    }
  });

  it("keeps the word and dots decorative so a reader announces the label once", () => {
    // aria-live would otherwise re-announce the status on every word change.
    const { container } = render(<ThinkingPipeline />);
    expect(container.querySelector(".thinking-word")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".thinking-dots")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps rotating even when the reader asked for reduced motion", () => {
    // Gating rotation on the media query froze the indicator on any machine with
    // OS animations off, so it read as a hung request. The word cross-fades in
    // place rather than travelling, which is what "reduce" actually asks for.
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query: string) => ({ matches: true, media: query }) as MediaQueryList,
    );
    const { container } = render(<ThinkingPipeline />);
    const first = container.querySelector(".thinking-word")?.textContent;
    act(() => {
      vi.advanceTimersByTime(2400);
    });
    expect(container.querySelector(".thinking-word")?.textContent).not.toBe(first);
  });
});
