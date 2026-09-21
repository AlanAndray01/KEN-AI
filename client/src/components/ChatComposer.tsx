import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { X } from "lucide-react";
import type { ModelCapability, PublicFile } from "@Ken/shared";
import { AttachmentChips } from "@/components/AttachmentChips";
import { ComposerMentions } from "@/components/ComposerMentions";
import { ComposerToolbar } from "@/components/ComposerToolbar";
import { cn } from "@/utils/cn";
import { filesFromClipboard } from "@/utils/composerPaste";
import { applyMention, filterMentions, mentionTokenAt, type MentionCandidate } from "@/utils/mentions";
import { isCoarsePointer, shouldSubmitOnKey } from "@/utils/keyboard";

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
  sendOnEnter = false,
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
    const submits = shouldSubmitOnKey(
      {
        key: event.key,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
      },
      // Read at key time rather than once on mount: a laptop with a touchscreen
      // can switch primary input mid-session.
      { sendOnEnter, coarsePointer: isCoarsePointer() },
    );
    if (!submits) return;
    event.preventDefault();
    if (!busy && canSend) onSubmit();
  }

  function takeFiles(list: FileList | File[]): void {
    const next = [...list];
    if (next.length === 0) return;
    onAddFiles?.(next);
  }

  /**
   * Ctrl/Cmd+V of an image or document, on every viewport.
   *
   * preventDefault runs as soon as clipboard files exist so the browser cannot
   * fire a second paste/drop of the same image. Text that arrived with the
   * files is inserted by hand after that.
   */
  function onPaste(event: ClipboardEvent<HTMLFormElement>): void {
    if (streaming || disabled || !onAddFiles) return;
    const clipboard = event.clipboardData;
    if (!clipboard) return;
    const files = filesFromClipboard(clipboard);
    if (files.length === 0) return;
    event.preventDefault();
    const text = clipboard.getData("text");
    if (text) {
      const start = textareaRef.current?.selectionStart ?? value.length;
      const end = textareaRef.current?.selectionEnd ?? start;
      onChange(value.slice(0, start) + text + value.slice(end));
      setCursor(start + text.length);
    }
    takeFiles(files);
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
      // On the form rather than the textarea: a paste while the send button or
      // an attachment chip holds focus should attach just the same.
      onPaste={onPaste}
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
          enterKeyHint="enter"
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
          <ComposerMentions items={mentionMatches} activeIndex={mentionIndex} onChoose={chooseMention} />
        ) : null}
        <ComposerToolbar
          fileInputRef={fileInputRef}
          capabilities={capabilities}
          streaming={streaming}
          disabled={disabled}
          uploading={uploading}
          generatingImage={generatingImage}
          canSend={canSend}
          sendOnEnter={sendOnEnter}
          value={value}
          webSearchEnabled={webSearchEnabled}
          recording={recording}
          onTakeFiles={takeFiles}
          onStop={onStop}
          {...(webSearchDisabledReason ? { webSearchDisabledReason } : {})}
          {...(imageDisabledReason ? { imageDisabledReason } : {})}
          {...(voiceDisabledReason ? { voiceDisabledReason } : {})}
          {...(liveVoiceDisabledReason ? { liveVoiceDisabledReason } : {})}
          {...(onAddFiles ? { onAddFiles } : {})}
          {...(onToggleWebSearch ? { onToggleWebSearch } : {})}
          {...(onGenerateImage ? { onGenerateImage } : {})}
          {...(onVoiceInput ? { onVoiceInput } : {})}
          {...(onLiveVoice ? { onLiveVoice } : {})}
        />
      </div>
    </form>
  );
}
