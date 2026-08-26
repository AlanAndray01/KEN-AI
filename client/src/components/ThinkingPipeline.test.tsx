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

  it("claims no analysis stages it cannot observe", () => {
    // The previous version cycled "Style / Format / Check" on a timer with no
    // link to the request. Asserting their absence keeps that from returning.
    render(<ThinkingPipeline />);
    for (const label of ["Style", "Format", "Check", "Thinking"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
  });

  it("stays silent before the slow threshold", () => {
    render(<ThinkingPipeline />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/\ds/)).not.toBeInTheDocument();
  });

  it("shows elapsed seconds once the response is genuinely slow", () => {
    render(<ThinkingPipeline />);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByText(/^\d+s$/)).toBeInTheDocument();
  });
});
