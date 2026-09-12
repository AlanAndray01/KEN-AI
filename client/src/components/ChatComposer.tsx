import { useEffect, useRef, useState, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import { AudioLines, Globe, Image as ImageIcon, Mic, Plus, Send, Square, X } from "lucide-react";
import { estimatePromptTokens, type ModelCapability, type PublicFile } from "@Ken/shared";
import { AttachmentChips } from "@/components/AttachmentChips";
import { cn } from "@/utils/cn";
import { composerAccept } from "@/utils/attachmentGate";
import { applyMention, filterMentions, mentionTokenAt, type MentionCandidate } from "@/utils/mentions";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  sendOnEnter?: boolean;
  disabled?: boolean;
  placeholder?: string;
  attachments?: PublicFile[];
  capabilities?: ModelCapability[];
  uploading?: boolean;
  onAddFiles?: (files: File[]) => void;
  onRemoveAttachment?: (fileId: string) => void;
  webSearchEnabled?: boolean;
  onToggleWebSearch?: () => void;
  webSearchDisabledReason?: string;
  onGenerateImage?: () => void;
  imageDisabledReason?: string;
  generatingImage?: boolean;
  onVoiceInput?: () => void;
  voiceDisabledReason?: string;
  recording?: boolean;
  onLiveVoice?: () => void;
  liveVoiceDisabledReason?: string;
  mentionCandidates?: MentionCandidate[];
  mentioned?: MentionCandidate;
  onMention?: (item: MentionCandidate | undefined) => void;
}

const COMPOSER_MIN_PX = 48;
const COMPOSER_MAX_PX = COMPOSER_MIN_PX * 2;

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  sendOnEnter = true,
  disabled = false,
  placeholder = "Ask anything",
  attachments = [],
  capabilities = [],
  uploading = false,
  onAddFiles,
  onRemoveAttachment,
  webSearchEnabled = false,
  onToggleWebSearch,
  webSearchDisabledReason,
  onGenerateImage,
  imageDisabledReason,
  generatingImage = false,
  onVoiceInput,
  voiceDisabledReason,
  recording = false,
  onLiveVoice,
  liveVoiceDisabledReason,
  mentionCandidates = [],
  mentioned,
  onMention,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cursor, setCursor] = useState(value.length);
  const [mentionIndex, setMentionIndex] = useState(0);
  const canSend = Boolean(value.trim() || attachments.length > 0);
  const busy = streaming || disabled || uploading || generatingImage;
  const mention = mentionTokenAt(value, cursor);
  const mentionMatches = mention ? filterMentions(mentionCandidates, mention.query) : [];
  const mentionOpen = Boolean(mention && mentionMatches.length > 0 && onMention);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    const frame = window.requestAnimationFrame(() => {
      element.style.height = "auto";
      element.style.height = `${Math.min(element.scrollHeight, COMPOSER_MAX_PX)}px`;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [value]);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (busy || !canSend) return;
    onSubmit();
  }

  useEffect(() => {
    setMentionIndex(0);
  }, [mention?.query, mentionOpen]);

  function chooseMention(item: MentionCandidate): void {
    if (!mention) return;
    onChange(applyMention(value, mention.start, cursor, item.name));
    onMention?.(item);
    setCursor(mention.start + item.name.length + 2);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (mentionOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setMentionIndex((index) => (index + 1) % mentionMatches.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setMentionIndex((index) => (index - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onChange(value.slice(0, mention?.start ?? 0) + value.slice(cursor));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = mentionMatches[mentionIndex] ?? mentionMatches[0];
        if (item) {
          event.preventDefault();
          chooseMention(item);
          return;
        }
      }
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (sendOnEnter && !event.shiftKey) {
      event.preventDefault();
      if (!busy && canSend) onSubmit();
      return;
    }
    if (!sendOnEnter && event.metaKey) {
      event.preventDefault();
      if (!busy && canSend) onSubmit();
    }
  }

  function takeFiles(list: FileList | File[]): void {
    const next = [...list];
    if (next.length === 0) return;
    onAddFiles?.(next);
  }

  function onDrop(event: DragEvent<HTMLFormElement>): void {
    event.preventDefault();
    setDragging(false);
    if (streaming || disabled) return;
    takeFiles(event.dataTransfer.files);
  }

  return (
    <form
      className="chat-composer mx-auto w-full max-w-3xl px-4 pb-4"
      onSubmit={handleSubmit}
      aria-label="Send message"
      aria-busy={streaming || Boolean(uploading)}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!streaming && !disabled) setDragging(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!streaming && !disabled) setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragging(false);
      }}
      onDrop={onDrop}
    >
      <div className={cn("composer-shell relative rounded-[1.75rem] border bg-surface shadow-sm", dragging ? "border-accent" : "border-border")}>
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[1.75rem] bg-surface/90 text-sm font-medium">
            Drop files to attach
          </div>
        ) : null}
        {mentioned ? (
          <div className="composer-mention-bar flex items-center justify-between gap-2 px-4 pt-3">
            <p className="text-xs text-fg-muted">
              Talking to <span className="font-medium text-fg">@{mentioned.name}</span>
            </p>
            <button
              type="button"
              className="rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
              aria-label="Clear GPT mention"
              onClick={() => onMention?.(undefined)}
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
        {attachments.length > 0 ? (
          <AttachmentChips
            items={attachments}
            {...(onRemoveAttachment ? { onRemove: onRemoveAttachment } : {})}
          />
        ) : null}
        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          disabled={disabled}
          placeholder={placeholder}
          aria-label="Message"
          aria-autocomplete="list"
          aria-haspopup={onMention ? "listbox" : undefined}
          aria-controls={mentionOpen ? "composer-mentions" : undefined}
          className="composer-input max-h-[96px] min-h-[48px] w-full resize-none overflow-y-auto bg-transparent px-4 pt-3 pb-2 text-sm outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          id="composer-input"
          onChange={(event) => {
            onChange(event.target.value);
            setCursor(event.target.selectionStart);
          }}
          onClick={(event) => setCursor(event.currentTarget.selectionStart)}
          onKeyUp={(event) => setCursor(event.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
        />
        {mentionOpen ? (
          <ul
            id="composer-mentions"
            role="listbox"
            aria-label="Mention a GPT"
            className="mx-3 mb-2 max-h-48 overflow-y-auto rounded-xl border border-border bg-canvas py-1"
          >
            {mentionMatches.map((item, index) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === mentionIndex}
                  className={cn(
                    "flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-surface-muted",
                    index === mentionIndex && "bg-surface-muted",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseMention(item)}
                >
                  <span className="font-medium">@{item.name}</span>
                  {item.description ? <span className="text-xs text-fg-muted">{item.description}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="composer-toolbar flex items-center justify-between px-3 pb-2">
          <div className="composer-tools flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              accept={composerAccept(capabilities)}
              onChange={(event) => {
                takeFiles(event.target.files ?? []);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-40"
              aria-label="Attach files"
              title="Attach images or documents. If this model cannot read them, Ken routes the turn to a vision-capable model."
              disabled={streaming || disabled || !onAddFiles}
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg p-2 hover:bg-surface-muted disabled:opacity-40",
                webSearchEnabled ? "text-accent" : "text-fg-muted hover:text-fg",
              )}
              aria-label="Web search"
              aria-pressed={webSearchEnabled}
              title={webSearchDisabledReason ?? (webSearchEnabled ? "Disable web search" : "Search the web")}
              disabled={streaming || disabled || Boolean(webSearchDisabledReason) || !onToggleWebSearch}
              onClick={onToggleWebSearch}
            >
              <Globe className="size-4" />
            </button>
            <button
              type="button"
              className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-40"
              aria-label="Generate image"
              title={imageDisabledReason ?? "Generate an image from this prompt"}
              disabled={streaming || disabled || generatingImage || Boolean(imageDisabledReason) || !onGenerateImage}
              onClick={onGenerateImage}
            >
              <ImageIcon className="size-4" />
            </button>
            <button
              type="button"
              className={cn(
                "rounded-lg p-2 hover:bg-surface-muted disabled:opacity-40",
                recording ? "text-accent" : "text-fg-muted hover:text-fg",
              )}
              aria-label={recording ? "Stop recording" : "Voice input"}
              title={voiceDisabledReason ?? (recording ? "Stop recording" : "Dictate a message")}
              disabled={streaming || disabled || Boolean(voiceDisabledReason) || !onVoiceInput}
              onClick={onVoiceInput}
            >
              <Mic className="size-4" />
            </button>
            <p className="composer-hint px-1 text-[11px] text-fg-muted">
              {sendOnEnter ? "Enter to send · Shift+Enter for a new line" : "⌘ Enter to send"}
              {value.trim() ? ` · ~${estimatePromptTokens(value)} tokens` : ""}
            </p>
          </div>
          <div className="composer-actions flex items-center gap-2">
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full border border-border text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-40"
              aria-label="Live voice chat"
              title={liveVoiceDisabledReason ?? "Talk to KEN hands-free"}
              disabled={streaming || disabled || Boolean(liveVoiceDisabledReason) || !onLiveVoice}
              onClick={onLiveVoice}
            >
              <AudioLines className="size-4" />
            </button>
            {streaming ? (
              <button
                type="button"
                className="inline-flex size-9 items-center justify-center rounded-full border border-border text-fg hover:bg-surface-muted"
                aria-label="Stop generating"
                onClick={onStop}
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={disabled || uploading || generatingImage || !canSend}
                aria-label="Send"
                className="inline-flex size-9 items-center justify-center rounded-full bg-accent text-accent-fg disabled:opacity-40"
              >
                <Send className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
