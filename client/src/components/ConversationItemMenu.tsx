import type { LucideIcon } from "lucide-react";
import { Download, Link2, Pencil, Pin, Share2, Trash2 } from "lucide-react";
import type { PublicConversation } from "@Ken/shared";
import { cn } from "@/utils/cn";

export function ConversationItemMenu({
  conversation,
  onRename,
  onTogglePin,
  onCopyShare,
  onExport,
  onDelete,
}: {
  conversation: PublicConversation;
  onRename: () => void;
  onTogglePin: () => void;
  onCopyShare: () => void;
  onExport: (format: "md" | "json" | "txt") => void;
  onDelete: () => void;
}) {
  return (
    <div className="absolute top-full right-1 z-10 mt-1 w-52 rounded-lg border border-border bg-surface py-1 shadow-lg">
      <MenuButton icon={Pencil} label="Rename" onClick={onRename} />
      <MenuButton
        icon={Pin}
        label={conversation.pinned ? "Unpin" : "Pin"}
        onClick={onTogglePin}
      />
      <MenuButton icon={Link2} label="Copy share link" onClick={onCopyShare} />
      <MenuButton icon={Share2} label="Export Markdown" onClick={() => onExport("md")} />
      <MenuButton icon={Download} label="Export JSON" onClick={() => onExport("json")} />
      <MenuButton icon={Download} label="Export TXT" onClick={() => onExport("txt")} />
      <MenuButton icon={Trash2} label="Delete" danger onClick={onDelete} />
    </div>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-surface-muted",
        danger && "text-danger",
      )}
      onClick={onClick}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}
