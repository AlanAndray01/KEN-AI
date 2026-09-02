/**
 * The boot loader markup lives in `index.html` so it paints before the bundle
 * loads. Whoever is ready first — React on an app route, or the landing hero
 * once its scenes are up — calls `hideBootLoader`.
 *
 * Chat and other app routes pass `"instant"`: a 700ms overlay fade is a
 * guaranteed LCP / Speed Index hit. Landing keeps `"fade"` so the hero never
 * cross-fades against the mark.
 */
const BOOT_ID = "boot-loader";
const FADE_MS = 400;

export type BootHideMode = "instant" | "fade";

export function hideBootLoader(mode: BootHideMode = "fade"): void {
  if (typeof document === "undefined") return;
  const node = document.getElementById(BOOT_ID);
  if (!node || node.dataset.state === "done") return;
  node.dataset.state = "done";
  if (mode === "instant") {
    node.remove();
    return;
  }
  node.classList.add("boot-done");
  window.setTimeout(() => node.remove(), FADE_MS);
}
