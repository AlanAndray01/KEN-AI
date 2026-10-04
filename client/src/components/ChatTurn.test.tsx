import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PublicMessage } from "@Ken/shared";
import { ChatTurn } from "./ChatTurn";

vi.mock("@/services/api", () => ({
  api: {
    files: {
      content: vi.fn(async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" })),
    },
  },
}));

const assistant: PublicMessage = {
  id: "a1",
  conversationId: "c1",
  role: "assistant",
  content: "A tabby on a windowsill.",
  status: "complete",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const turnProps = {
  streaming: false,
  ttsConfigured: false,
  ttsUnavailableReason: "TTS is not configured",
  feedbackPending: false,
  onEdit: () => undefined,
  onRegenerate: () => undefined,
  onCopy: () => undefined,
  onSpeak: () => undefined,
  onFeedback: () => undefined,
};

describe("ChatTurn", () => {
  it("keeps the provider quota explanation visible on a failed turn", () => {
    render(<ChatTurn {...turnProps} message={{ ...assistant, content: "", status: "error",
      errorCode: "PROVIDER_RATE_LIMITED", errorMessage: "Cloudflare AI daily limit reached. It resets at 00:00 UTC (5:00 AM PKT)." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Cloudflare AI daily limit reached");
    expect(screen.getByRole("alert")).toHaveTextContent("5:00 AM PKT");
  });
  it("renders a generated image on the assistant turn", async () => {
    render(
      <ChatTurn
        {...turnProps}
        remixPrompt="draw a cat"
        onRemixImage={() => undefined}
        message={{
          ...assistant,
          attachments: [
            {
              id: "att1",
              fileId: "file1",
              originalName: "Ken-image.jpg",
              mimeType: "image/jpeg",
              size: 8,
              kind: "image",
            },
          ],
        }}
      />,
    );

    expect(screen.getByRole("list", { name: "Message attachments" })).toBeInTheDocument();
    expect(screen.getByText("A tabby on a windowsill.")).toBeInTheDocument();
  });

  it("does not show Generation failed when the assistant already has the picture", () => {
    render(
      <ChatTurn
        {...turnProps}
        message={{
          ...assistant,
          content: "",
          attachments: [
            {
              id: "att1",
              fileId: "file1",
              originalName: "Ken-image.jpg",
              mimeType: "image/jpeg",
              size: 8,
              kind: "image",
            },
          ],
        }}
      />,
    );

    expect(screen.queryByText("Generation failed")).not.toBeInTheDocument();
    expect(screen.queryByText("No reply was generated. Try sending again.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("offers Retry when a complete assistant turn has no text", () => {
    const onRegenerate = vi.fn();
    render(
      <ChatTurn
        {...turnProps}
        onRegenerate={onRegenerate}
        message={{ ...assistant, content: "" }}
      />,
    );

    expect(screen.getByText("No reply was generated")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRegenerate).toHaveBeenCalledWith("a1");
  });
});
