import { KenMark } from "@/components/KenMark";

/**
 * The K mark beside an assistant turn. User turns carry no avatar: the bubble's
 * side and tint already say who wrote it, and a "YOU" chip only ate width.
 *
 * It is decorative: the turn's author is already conveyed by the message's own
 * markup, so screen readers skip it rather than hearing the author twice.
 */
export function MessageAvatar() {
  return (
    <span
      aria-hidden="true"
      className="message-avatar mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface"
    >
      <KenMark className="size-4" />
    </span>
  );
}
