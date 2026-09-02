import { useId } from "react";
import { cn } from "@/utils/cn";

/**
 * The KEN mark: a skewed K whose stem is smoky white and whose arm is brand
 * green, with a thin dark inlay that reads as a bevel.
 *
 * Gradient ids are generated per instance with `useId`. The mark appears in the
 * sidebar, on the auth screens and in the mobile header at the same time, and
 * duplicated ids would make every copy inherit the fill of whichever one the
 * browser resolved first.
 *
 * The stem is drawn from `currentColor` rather than a fixed white, so the mark
 * stays legible on the light theme's white canvas as well as the dark one.
 */

interface KenMarkProps {
  className?: string;
  /** Adds the KEN AI wordmark beside the glyph. */
  withWordmark?: boolean;
  /** Styles the wordmark itself, so a caller can hide it at one breakpoint. */
  wordmarkClassName?: string;
}

export function KenMark({ className, withWordmark = false, wordmarkClassName }: KenMarkProps) {
  const id = useId();
  const stem = `ken-stem-${id}`;
  const arm = `ken-arm-${id}`;

  const glyph = (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      className={cn("h-8 w-8 shrink-0 overflow-visible text-fg", className)}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={stem} x1="20" y1="10" x2="34" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="currentColor" stopOpacity="1" />
          <stop offset="0.55" stopColor="currentColor" stopOpacity="0.94" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.66" />
        </linearGradient>
        <linearGradient id={arm} x1="88" y1="6" x2="44" y2="94" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A9FFC2" />
          <stop offset="0.28" stopColor="#6CFF92" />
          <stop offset="0.62" stopColor="var(--accent)" />
          <stop offset="1" stopColor="#00A62A" />
        </linearGradient>
      </defs>
      <g transform="translate(1 0) skewX(-7)">
        <path d="M27 10h7v80H20V19z" fill={`url(#${stem})`} />
        <path d="M27 24h3v62h-3z" fill="var(--canvas)" fillOpacity="0.62" />
        <path d="M86 10 42 50l42 40" stroke={`url(#${arm})`} strokeWidth="14" />
        <path d="M86 10 42 50l42 40" stroke="var(--canvas)" strokeWidth="3.4" strokeOpacity="0.5" />
        <path
          d="M76 4.9 45.5 32.6M44.8 67.2 73.9 94.8"
          stroke={`url(#${arm})`}
          strokeWidth="1.3"
          strokeOpacity="0.45"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );

  if (!withWordmark) return glyph;

  return (
    <span className="inline-flex items-center gap-2.5">
      {glyph}
      <span
        className={cn(
          "text-[0.95rem] font-semibold tracking-[0.07em] whitespace-nowrap uppercase",
          wordmarkClassName,
        )}
      >
        KEN <span className="font-medium text-accent">AI</span>
      </span>
    </span>
  );
}
