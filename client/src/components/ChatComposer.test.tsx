import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";

describe("ChatComposer", () => {
  it("sends on Enter and keeps Shift+Enter as a newline", () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    render(
      <ChatComposer
        value="Hello"
        onChange={onChange}
        onSubmit={onSubmit}
        onStop={vi.fn()}
        streaming={false}
      />,
    );

    expect(screen.getByRole("form", { name: "Send message" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText("Message"), { key: "Enter", shiftKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Attach files" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Web search" })).toBeInTheDocument();
    expect(screen.getByLabelText("Message")).not.toHaveAttribute("maxLength");
    expect(screen.getByLabelText("Message").tagName).toBe("TEXTAREA");
    expect(screen.getByText(/~2 tokens/)).toBeInTheDocument();
  });

  it("disables tool controls with the provided reason", () => {
    render(
      <ChatComposer
        value="Hello"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        streaming={false}
        onToggleWebSearch={vi.fn()}
        webSearchDisabledReason="This model cannot use tools."
        onGenerateImage={vi.fn()}
        imageDisabledReason="Image generation is not configured."
        onVoiceInput={vi.fn()}
        voiceDisabledReason="Voice input is not configured."
      />,
    );

    expect(screen.getByRole("button", { name: "Web search" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Generate image" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Voice input" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Web search" })).toHaveAttribute("title", "This model cannot use tools.");
  });

  it("shows GPT mention suggestions after @", () => {
    render(
      <ChatComposer
        value="@"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        streaming={false}
        mentionCandidates={[{ id: "g1", name: "Writer", description: "Editing help" }]}
        onMention={vi.fn()}
      />,
    );

    expect(screen.getByRole("listbox", { name: "Mention a GPT" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Writer/ })).toBeInTheDocument();
  });
});
