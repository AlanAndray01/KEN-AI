import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryPage } from "./LibraryPage";

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    files: {
      list: vi.fn().mockResolvedValue({ files: [] }),
      content: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

describe("LibraryPage", () => {
  it("shows an empty state when there are no files", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <LibraryPage />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Library" })).toBeInTheDocument();
    expect(await screen.findByText(/No files yet/)).toBeInTheDocument();
  });
});
