/**
 * Build-time feature switches.
 *
 * Vite substitutes `import.meta.env.VITE_*` into the bundle when it builds, so
 * these are decided by the environment that runs `npm run build` — not by the
 * server that later hosts the files. Changing one on a deployed host has no
 * effect until the client is rebuilt.
 */

/** `true`/`false` (or `1`/`0`); `undefined` when unset or unrecognised. */
export function readBooleanFlag(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

/**
 * Whether `/` serves the public landing page.
 *
 * Unset, this follows the build mode: visible under `vite dev` for local
 * testing, hidden in a production build. Setting VITE_SHOW_LANDING_PAGE
 * overrides that in either direction. With it off, `/` redirects — to the chat
 * workspace when signed in, otherwise to the sign-in form.
 */
export const showLandingPage: boolean =
  // Each arm compares `import.meta.env.…` against a literal. Vite substitutes
  // that expression inline, so the whole chain folds to a constant at build time
  // and Rollup drops the landing page's chunk from the output entirely — the
  // page is absent from the bundle, not merely unreachable within it. Routing it
  // through a helper call instead would leave the branch unfoldable and ship the
  // page as dead weight. The helper still backs any spelling not matched here.
  import.meta.env.VITE_SHOW_LANDING_PAGE === "false" ||
  import.meta.env.VITE_SHOW_LANDING_PAGE === "0"
    ? false
    : import.meta.env.VITE_SHOW_LANDING_PAGE === "true" ||
        import.meta.env.VITE_SHOW_LANDING_PAGE === "1"
      ? true
      : import.meta.env.VITE_SHOW_LANDING_PAGE === undefined
        ? import.meta.env.DEV
        : (readBooleanFlag(import.meta.env.VITE_SHOW_LANDING_PAGE) ?? import.meta.env.DEV);
