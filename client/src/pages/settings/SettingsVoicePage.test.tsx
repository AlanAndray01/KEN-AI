import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { SettingsVoicePage } from "./SettingsVoicePage";

vi.mock("@/services/api", () => ({
  api: {
    voice: {
      status: vi.fn().mockResolvedValue({
        sttConfigured: false,
        ttsConfigured: false,
        message: "Voice is not configured. Set VOICE_PROVIDER=openai and VOICE_API_KEY or OPENAI_API_KEY. Realtime voice is not enabled.",
      }),
    },
  },
}));

describe("SettingsVoicePage", () => {
  it("shows unconfigured speech-to-text and text-to-speech status", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <SettingsVoicePage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("heading", { name: "Voice" })).toBeInTheDocument();
    expect(screen.getByText("Speech to text").parentElement).toHaveTextContent("Not configured");
    expect(screen.getByText("Text to speech").parentElement).toHaveTextContent("Not configured");
    expect(screen.getByText(/Voice is not configured/)).toBeInTheDocument();
  });
});
