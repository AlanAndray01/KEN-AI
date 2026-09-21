import type { RefObject } from "react";
import { AudioLines, Globe, Image as ImageIcon, Mic, Plus, Send, Square } from "lucide-react";
import { estimatePromptTokens, type ModelCapability } from "@Ken/shared";
import { cn } from "@/utils/cn";
import { composerAccept } from "@/utils/attachmentGate";
import { submitModifierLabel } from "@/utils/keyboard";

export function ComposerToolbar({
  fileInputRef,
  capabilities,
  streaming,
  disabled,
  uploading,
  generatingImage,
  canSend,
  sendOnEnter,
  value,
  webSearchEnabled,
  webSearchDisabledReason,
  imageDisabledReason,
  recording,
  voiceDisabledReason,
  liveVoiceDisabledReason,
  onAddFiles,
  onTakeFiles,
  onToggleWebSearch,
  onGenerateImage,
  onVoiceInput,
  onLiveVoice,
  onStop,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  capabilities: ModelCapability[];
  streaming: boolean;
  disabled: boolean;
  uploading: boolean;
  generatingImage: boolean;
  canSend: boolean;
  sendOnEnter: boolean;
  value: string;
  webSearchEnabled: boolean;
  webSearchDisabledReason?: string;
  imageDisabledReason?: string;
  recording: boolean;
  voiceDisabledReason?: string;
  liveVoiceDisabledReason?: string;
  onAddFiles?: (files: File[]) => void;
  onTakeFiles: (list: FileList | File[]) => void;
  onToggleWebSearch?: () => void;
  onGenerateImage?: () => void;
  onVoiceInput?: () => void;
  onLiveVoice?: () => void;
  onStop: () => void;
}) {
  return (
    <div className="composer-toolbar flex items-center justify-between px-3 pb-2">
      <div className="composer-tools flex items-center gap-1">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          accept={composerAccept(capabilities)}
          onChange={(event) => {
            onTakeFiles(event.target.files ?? []);
            event.target.value = "";
          }}
        />
        <button
          type="button"
          className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg disabled:opacity-40"
          aria-label="Attach files"
          title="Attach images or documents. PDFs and Word files are read natively when the model allows it, otherwise Ken extracts their text."
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
          {sendOnEnter ? "Enter to send · Shift+Enter for a new line" : `${submitModifierLabel()}+Enter to send · Enter for a new line`}
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
  );
}
