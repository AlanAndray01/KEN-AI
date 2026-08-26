import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import type { PublicAttachment, PublicFile } from "@Ken/shared";
import { api } from "@/services/api";

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
          <AttachmentPreview item={item} />
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

export function MessageAttachments({ attachments }: { attachments: PublicAttachment[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label="Message attachments">
      {attachments.map((item) => (
        <li key={item.id}>
          <AttachmentPreview
            item={{
              id: item.fileId,
              originalName: item.originalName,
              mimeType: item.mimeType,
              kind: item.kind,
            }}
          />
        </li>
      ))}
    </ul>
  );
}

function AttachmentPreview({ item }: { item: AttachmentLike }) {
  const fileId = item.fileId ?? item.id;
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (item.kind !== "image") return;
    let objectUrl: string | undefined;
    let cancelled = false;
    void api.files
      .content(fileId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fileId, item.kind]);

  if (item.kind === "image") {
    return url ? (
      <img src={url} alt={item.originalName} className="h-20 w-20 rounded-xl object-cover" />
    ) : (
      <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-surface-muted text-xs text-fg-muted">
        Image
      </div>
    );
  }

  return (
    <div className="flex max-w-[12rem] items-center gap-2 rounded-xl border border-border bg-canvas px-2 py-1.5 text-xs">
      <FileText className="size-4 shrink-0 text-fg-muted" />
      <span className="truncate">{item.originalName}</span>
    </div>
  );
}
