import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeGenerationTicker } from "./CodeGenerationTicker";

describe("CodeGenerationTicker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows progress without an estimate while the server figure is still in flight", () => {
    render(<CodeGenerationTicker />);
    expect(screen.getByRole("status", { name: "Generating code" })).toBeInTheDocument();
    expect(screen.getByText(/Generating high-performance code/)).toBeInTheDocument();
    // No number is invented before the measured estimate arrives.
    expect(screen.queryByText(/Estimated time/)).toBeNull();
  });

  it("shows the estimate once it arrives", () => {
    render(<CodeGenerationTicker estimate={{ estimatedMs: 12_000, samples: 20, matchedMode: true }} />);
    expect(screen.getByText(/Estimated time: ~12s/)).toBeInTheDocument();
  });

  it("hedges the wording when the sample size is thin", () => {
    render(<CodeGenerationTicker estimate={{ estimatedMs: 12_000, samples: 3, matchedMode: true }} />);
    expect(screen.getByText(/Estimated time: roughly 12s/)).toBeInTheDocument();
  });

  it("hedges when a deep-code turn borrowed general-mode samples", () => {
    render(<CodeGenerationTicker estimate={{ estimatedMs: 12_000, samples: 40, matchedMode: false }} />);
    expect(screen.getByText(/Estimated time: roughly 12s/)).toBeInTheDocument();
  });

  it("drops the estimate rather than counting past it", () => {
    render(<CodeGenerationTicker estimate={{ estimatedMs: 1_000, samples: 20, matchedMode: true }} />);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByText(/longer than usual/)).toBeInTheDocument();
    expect(screen.queryByText(/Estimated time/)).toBeNull();
  });
});
