import { useEffect, useRef, useState } from "react";
import { Download, Link2, Share2 } from "lucide-react";
import type { ExportFormat } from "@Ken/shared";
import { ApiError, api } from "@/services/api";
import { toast } from "@/stores/toastStore";
import { downloadBlob } from "@/utils/download";
import { cn } from "@/utils/cn";

export function ShareExportMenu({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent): void {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function copyShareLink(): Promise<void> {
    setBusy(true);
    try {
      const existing = await api.conversations.share.get(conversationId);
      const share = existing.share ?? (await api.conversations.share.create(conversationId)).share;
      await navigator.clipboard.writeText(share.url);
      toast("Read-only share link copied", "success");
      setOpen(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to create share link", "error");
    } finally {
      setBusy(false);
    }
  }

  async function revokeShare(): Promise<void> {
    setBusy(true);
    try {
      await api.conversations.share.revoke(conversationId);
      toast("Share link revoked", "success");
      setOpen(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to revoke share link", "error");
    } finally {
      setBusy(false);
    }
  }

  async function exportChat(format: ExportFormat): Promise<void> {
    setBusy(true);
    try {
      const file = await api.conversations.export(conversationId, format);
      downloadBlob(file.blob, file.filename);
      toast(`Exported as ${format.toUpperCase()}`, "success");
      setOpen(false);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : "Unable to export conversation", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        className="rounded-lg p-2 text-fg-muted hover:bg-surface-muted hover:text-fg"
        aria-label="Share and export"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((value) => !value)}
      >
        <Share2 className="size-4" />
      </button>
      {open ? (
        <div className="absolute top-full right-0 z-20 mt-1 w-52 rounded-xl border border-border bg-surface py-1 shadow-lg">
          <MenuItem icon={Link2} label="Copy share link" onClick={() => void copyShareLink()} />
          <MenuItem label="Revoke share link" onClick={() => void revokeShare()} />
          <div className="my-1 border-t border-border" />
          <MenuItem icon={Download} label="Export Markdown" onClick={() => void exportChat("md")} />
          <MenuItem icon={Download} label="Export JSON" onClick={() => void exportChat("json")} />
          <MenuItem icon={Download} label="Export TXT" onClick={() => void exportChat("txt")} />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
}: {
  icon?: typeof Share2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted")}
      onClick={onClick}
    >
      {Icon ? <Icon className="size-4" /> : <span className="size-4" />}
      {label}
    </button>
  );
}
