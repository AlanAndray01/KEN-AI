import { useEffect } from "react";
import { X } from "lucide-react";
import { useToastStore } from "@/stores/toastStore";
import { cn } from "@/utils/cn";

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape" && toasts.length > 0) {
        const last = toasts[toasts.length - 1];
        if (last) dismiss(last.id);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dismiss, toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      className="toaster pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(100%-2rem,22rem)] flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          role={item.tone === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border px-3 py-2 text-sm shadow-lg",
            item.tone === "error" && "border-danger/40 bg-surface text-danger",
            item.tone === "success" && "border-accent/40 bg-surface text-fg",
            item.tone === "info" && "border-border bg-surface text-fg",
          )}
        >
          <p className="flex-1 pt-0.5">{item.message}</p>
          <button
            type="button"
            className="rounded-md p-1 text-fg-muted hover:bg-surface-muted hover:text-fg"
            aria-label="Dismiss notification"
            onClick={() => dismiss(item.id)}
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
