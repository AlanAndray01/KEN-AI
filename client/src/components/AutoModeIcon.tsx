interface AutoModeIconProps {
  className?: string;
}

/**
 * Ken's Auto mode mark: a circuit eye.
 *
 * Drawn rather than imported so it inherits `currentColor`, which is what lets a
 * caller tint it with `text-accent` and have it follow the theme's green instead
 * of carrying a baked-in hex. Strokes only, on the same 24-unit grid as the
 * Lucide icons beside it, so weights match across the header.
 *
 * Decorative in every current use: the control it sits in carries its own label,
 * so this is always `aria-hidden`.
 */
export function AutoModeIcon({ className = "size-4" }: AutoModeIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {/* Eye outline: two arcs meeting at a point on each side. */}
      <path d="M1.8 12C5.2 7.6 8.6 5.4 12 5.4s6.8 2.2 10.2 6.6c-3.4 4.4-6.8 6.6-10.2 6.6S5.2 16.4 1.8 12Z" />
      {/* Iris and pupil. */}
      <circle cx="12" cy="12" r="5.2" />
      <circle cx="12" cy="12" r="2.4" />
      {/* Circuit traces running out of the pupil to the edges of the eye. */}
      <path d="M6.9 10.1h2.4" />
      <path d="M14.7 10.1h2.4" />
      <path d="M6.9 13.9h2.7l1.1 1.3" />
      <path d="M17.1 13.9h-2.7" />
      <path d="M12 9.6V8.2" />
      {/* Nodes terminating the traces. */}
      <circle cx="6.1" cy="10.1" r="0.7" />
      <circle cx="12" cy="7.5" r="0.7" />
      <circle cx="10.8" cy="16" r="0.7" />
      <circle cx="17.9" cy="13.9" r="0.7" />
    </svg>
  );
}
