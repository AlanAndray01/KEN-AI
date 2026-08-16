import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsNotificationsPage } from "./SettingsNotificationsPage";

vi.mock("@/services/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    notifications: {
      list: vi.fn().mockResolvedValue({ notifications: [] }),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    },
  },
}));

describe("SettingsNotificationsPage", () => {
  it("shows an empty inbox honestly", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SettingsNotificationsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(await screen.findByText("No notifications yet.")).toBeInTheDocument();
  });
});
