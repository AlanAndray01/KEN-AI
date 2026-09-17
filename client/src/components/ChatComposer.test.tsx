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

  /** A clipboard payload as the browser hands it over. */
  function clipboard(files: File[], text = ""): { clipboardData: unknown } {
    return {
      clipboardData: {
        items: files.map((file) => ({ kind: "file", getAsFile: () => file })),
        files,
        getData: () => text,
      },
    };
  }

  function pasteInto(onAddFiles: ReturnType<typeof vi.fn>, payload: { clipboardData: unknown }, streaming = false) {
    render(
      <ChatComposer
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onStop={vi.fn()}
        streaming={streaming}
        onAddFiles={onAddFiles}
      />,
    );
    fireEvent.paste(screen.getByRole("form", { name: "Send message" }), payload);
  }

  it("attaches an image pasted with Ctrl+V", () => {
    const onAddFiles = vi.fn();
    const shot = new File(["binary"], "image.png", { type: "image/png" });

    pasteInto(onAddFiles, clipboard([shot]));

    expect(onAddFiles).toHaveBeenCalledTimes(1);
    const [pasted] = onAddFiles.mock.calls[0]?.[0] as File[];
    expect(pasted?.type).toBe("image/png");
    // A screenshot has no name of its own; every paste would otherwise be "image.png".
    expect(pasted?.name).toMatch(/^pasted-.+\.png$/);
  });

  it("accepts a paste that only fills items, as Safari and iOS do", () => {
    const onAddFiles = vi.fn();
    const shot = new File(["binary"], "image.png", { type: "image/png" });

    pasteInto(onAddFiles, {
      clipboardData: {
        items: [{ kind: "file", getAsFile: () => shot }],
        files: [],
        getData: () => "",
      },
    });

    expect(onAddFiles).toHaveBeenCalledTimes(1);
  });

  it("lists a payload once even when the browser reports it twice", () => {
    const onAddFiles = vi.fn();
    const shot = new File(["binary"], "shot.png", { type: "image/png" });

    // Chrome fills items and files with the same payload.
    pasteInto(onAddFiles, clipboard([shot]));

    expect(onAddFiles.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("keeps a real filename instead of renaming it", () => {
    const onAddFiles = vi.fn();
    const doc = new File(["%PDF"], "quarterly-report.pdf", { type: "application/pdf" });

    pasteInto(onAddFiles, clipboard([doc]));

    const [pasted] = onAddFiles.mock.calls[0]?.[0] as File[];
    expect(pasted?.name).toBe("quarterly-report.pdf");
  });

  it("leaves an ordinary text paste alone", () => {
    const onAddFiles = vi.fn();

    pasteInto(onAddFiles, {
      clipboardData: {
        items: [{ kind: "string", getAsFile: () => null }],
        files: [],
        getData: () => "just some text",
      },
    });

    expect(onAddFiles).not.toHaveBeenCalled();
  });

  it("ignores a paste while a reply is streaming", () => {
    const onAddFiles = vi.fn();
    const shot = new File(["binary"], "image.png", { type: "image/png" });

    pasteInto(onAddFiles, clipboard([shot]), true);

    expect(onAddFiles).not.toHaveBeenCalled();
  });
});
