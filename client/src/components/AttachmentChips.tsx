import { FileText, X } from "lucide-react";
import type { PublicAttachment, PublicFile } from "@Ken/shared";
import { ChatImage } from "@/components/ChatImage";

type AttachmentLike = Pick<PublicFile, "id" | "originalName" | "mimeType" | "kind"> & { fileId?: string };

export function AttachmentChips({
  items,
  onRemove,
}: {
  items: AttachmentLike[];
  onRemove?: (id: string) => void;
}) {
  return (
    <ul className="flex flex-wrap gap-2 px-3 pt-3" aria-label="Attachments">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <AttachmentPreview item={item} layout="thumb" />
          {onRemove ? (
            <button
              type="button"
              className="absolute -top-1.5 -right-1.5 rounded-full border border-border bg-surface p-0.5 text-fg-muted hover:text-fg"
              aria-label={`Remove ${item.originalName}`}
              onClick={() => onRemove(item.fileId ?? item.id)}
            >
              <X className="size-3" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function MessageAttachments({
  attachments,
  layout = "thumb",
  remixPrompt,
  onRemix,
}: {
  attachments: PublicAttachment[];
  /** Generated images on an assistant turn are the reply, not a chip. */
  layout?: "thumb" | "generated";
  remixPrompt?: string | undefined;
  onRemix?: ((prompt: string) => void) | undefined;
}) {
  return (
    // No margin here: the bubble places this list and owns the spacing around it.
    <ul className="flex flex-wrap gap-2" aria-label="Message attachments">
      {attachments.map((item) => (
        <li key={item.id} className={layout === "generated" ? "w-full" : undefined}>
          <AttachmentPreview
            item={{
              id: item.fileId,
              originalName: item.originalName,
              mimeType: item.mimeType,
              kind: item.kind,
            }}
            layout={layout}
            remixPrompt={remixPrompt}
            onRemix={onRemix}
          />
        </li>
      ))}
    </ul>
  );
}

function AttachmentPreview({
  item,
  layout = "thumb",
  remixPrompt,
  onRemix,
}: {
  item: AttachmentLike;
  layout?: "thumb" | "generated";
  remixPrompt?: string | undefined;
  onRemix?: ((prompt: string) => void) | undefined;
}) {
  if (item.kind === "image") {
    return <ChatImage item={item} layout={layout} remixPrompt={remixPrompt} onRemix={onRemix} />;
  }

  return (
    <div className="flex max-w-[12rem] items-center gap-2 rounded-xl border border-border bg-canvas px-2 py-1.5 text-xs">
      <FileText className="size-4 shrink-0 text-fg-muted" />
      <span className="truncate">{item.originalName}</span>
    </div>
  );
}
