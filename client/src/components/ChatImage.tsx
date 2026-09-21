import { useEffect, useId, useState, type ReactNode } from "react";
import { Copy, Download, Maximize2, Pencil, X } from "lucide-react";
import type { PublicFile } from "@Ken/shared";
import { toast } from "@/stores/toastStore";
import { retainChatImage } from "@/utils/chatImageCache";
import { cn } from "@/utils/cn";

type AttachmentLike = Pick<PublicFile, "id" | "originalName" | "mimeType" | "kind"> & { fileId?: string };

export function ChatImage({
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
  const fileId = item.fileId ?? item.id;
  const [blob, setBlob] = useState<Blob>();
  const [url, setUrl] = useState<string>();
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    let cancelled = false;
    const release = retainChatImage(fileId, (entry) => {
      if (cancelled) return;
      setBlob(entry.blob);
      setUrl(entry.url);
    });
    return () => {
      cancelled = true;
      release();
    };
  }, [fileId]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const downloadName = downloadFileName(item.originalName, blob?.type ?? item.mimeType);
  const canRemix = Boolean(remixPrompt?.trim() && onRemix);

  async function copyImage(): Promise<void> {
    if (!blob) {
      toast("Image is still loading.", "error");
      return;
    }
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/jpeg"]: blob })]);
      toast("Image copied", "success");
    } catch {
      toast("Unable to copy image", "error");
    }
  }

  function downloadImage(): void {
    if (!url) {
      toast("Image is still loading.", "error");
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = downloadName;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  const imageClass =
    layout === "generated"
      ? "max-h-80 w-full max-w-md cursor-zoom-in rounded-xl object-contain"
      : "h-20 w-20 cursor-zoom-in rounded-xl object-cover";
  const placeholderClass =
    layout === "generated"
      ? "flex h-40 max-w-md items-center justify-center rounded-xl bg-surface-muted text-xs text-fg-muted"
      : "flex h-20 w-20 items-center justify-center rounded-xl bg-surface-muted text-xs text-fg-muted";

  return (
    <div className="group/image relative inline-block max-w-full">
      {url ? (
        <button type="button" className="block max-w-full" onClick={() => setOpen(true)} aria-label={`View ${item.originalName}`}>
          <img src={url} alt={item.originalName} className={imageClass} />
        </button>
      ) : (
        <div className={placeholderClass}>Image</div>
      )}
      {url && !open ? (
        <ImageActionBar
          className="absolute right-2 bottom-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/image:opacity-100 group-focus-within/image:opacity-100"
          canRemix={canRemix}
          onView={() => setOpen(true)}
          onDownload={downloadImage}
          onCopy={() => void copyImage()}
          onRemix={canRemix && remixPrompt && onRemix ? () => onRemix(remixPrompt) : undefined}
        />
      ) : null}
      {open && url ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button type="button" className="absolute inset-0 bg-black/70" aria-label="Close image" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative z-10 flex max-h-[90vh] max-w-[min(48rem,100%)] flex-col gap-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id={titleId} className="truncate text-sm font-medium text-white">
                {item.originalName}
              </h2>
              <button
                type="button"
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Close"
                onClick={() => setOpen(false)}
              >
                <X className="size-4" />
              </button>
            </div>
            <img src={url} alt={item.originalName} className="max-h-[75vh] w-auto rounded-xl object-contain" />
            <ImageActionBar
              className="self-start"
              canRemix={canRemix}
              onView={() => undefined}
              onDownload={downloadImage}
              onCopy={() => void copyImage()}
              onRemix={canRemix && remixPrompt && onRemix ? () => onRemix(remixPrompt) : undefined}
              hideView
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ImageActionBar({
  className,
  canRemix,
  hideView = false,
  onView,
  onDownload,
  onCopy,
  onRemix,
}: {
  className?: string;
  canRemix: boolean;
  hideView?: boolean;
  onView: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onRemix?: (() => void) | undefined;
}) {
  return (
    <div className={cn("flex gap-1 rounded-lg border border-border bg-surface/95 p-1 shadow-sm", className)}>
      {hideView ? null : (
        <ActionButton label="View" onClick={onView}>
          <Maximize2 className="size-3.5" />
        </ActionButton>
      )}
      <ActionButton label="Download" onClick={onDownload}>
        <Download className="size-3.5" />
      </ActionButton>
      <ActionButton label="Copy image" onClick={onCopy}>
        <Copy className="size-3.5" />
      </ActionButton>
      {canRemix && onRemix ? (
        <ActionButton label="Edit prompt" onClick={onRemix}>
          <Pencil className="size-3.5" />
        </ActionButton>
      ) : null}
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="rounded-md p-1.5 text-fg-muted hover:bg-surface-muted hover:text-fg"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

export function downloadFileName(originalName: string, mimeType: string): string {
  if (/\.(jpe?g|png|gif|webp)$/i.test(originalName)) return originalName;
  if (mimeType === "image/png") return "ken-ai-image.png";
  return "ken-ai-image.jpg";
}
