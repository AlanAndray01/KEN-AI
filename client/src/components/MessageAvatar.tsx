import { cn } from "@/utils/cn";

/**
 * The YOU / KEN chip that sits beside a turn, carried over from the landing
 * page's interface panel so the real chat reads the same as the marketing shot.
 *
 * It is decorative: the turn's author is already conveyed by the message's own
 * markup, so screen readers skip the chip rather than hearing "you" twice.
 */
export function MessageAvatar({ role }: { role: "user" | "assistant" }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "message-avatar mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border font-mono text-[10px] tracking-wider",
        role === "assistant"
          ? "border-accent/35 bg-accent/10 text-accent"
          : "border-border text-fg-muted",
      )}
    >
      {role === "assistant" ? "KEN" : "YOU"}
    </span>
  );
}
