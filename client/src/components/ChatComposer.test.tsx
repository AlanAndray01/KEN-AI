import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatComposer } from "./ChatComposer";

describe("ChatComposer", () => {
  it("keeps Enter and Shift+Enter as newlines and sends on Ctrl+Enter or Cmd+Enter", () => {
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
    const input = screen.getByLabelText("Message");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(input).toHaveAttribute("enterkeyhint", "enter");
    expect(screen.getByText(/\+Enter to send · Enter for a new line/)).toBeInTheDocument();
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

    const input = screen.getByLabelText("Message");
    expect(input).not.toHaveAttribute("aria-expanded");
    expect(input).toHaveAttribute("aria-autocomplete", "list");
    expect(input).toHaveAttribute("aria-haspopup", "listbox");
    expect(input).toHaveAttribute("aria-controls", "composer-mentions");
    expect(screen.getByRole("listbox", { name: "Mention a GPT" })).toHaveAttribute("id", "composer-mentions");
    expect(screen.getByRole("option", { name: /Writer/ })).toBeInTheDocument();
  });

  it("does not put aria-expanded on the message textbox", () => {
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        streaming={false}
      />,
    );

    const input = screen.getByLabelText("Message");
    expect(input).not.toHaveAttribute("aria-expanded");
    expect(input).not.toHaveAttribute("aria-controls");
  });
});
