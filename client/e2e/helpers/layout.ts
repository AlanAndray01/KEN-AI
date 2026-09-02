import { expect, type Locator, type Page } from "@playwright/test";

const SLACK_PX = 1.5;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export async function boxOf(locator: Locator): Promise<Box> {
  const handle = await locator.elementHandle();
  if (!handle) {
    throw new Error("Element is not attached");
  }
  const box = await handle.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
  });
  await handle.dispose();
  return box;
}

export function boxesOverlap(a: Box, b: Box, slack = SLACK_PX): boolean {
  return !(a.right <= b.x + slack || a.x >= b.right - slack || a.bottom <= b.y + slack || a.y >= b.bottom - slack);
}

export async function assertInsideViewport(locator: Locator, label: string): Promise<void> {
  await expect(locator, label).toBeVisible();
  const box = await boxOf(locator);
  const viewport = locator.page().viewportSize();
  if (!viewport) {
    throw new Error("Viewport size is not set");
  }
  expect(box.x, `${label} left edge`).toBeGreaterThanOrEqual(-SLACK_PX);
  expect(box.y, `${label} top edge`).toBeGreaterThanOrEqual(-SLACK_PX);
  expect(box.right, `${label} right edge`).toBeLessThanOrEqual(viewport.width + SLACK_PX);
  expect(box.width, `${label} has width`).toBeGreaterThan(0);
  expect(box.height, `${label} has height`).toBeGreaterThan(0);
}

export async function assertNoHorizontalOverflow(page: Page): Promise<void> {
  const report = await page.evaluate((slack) => {
    const vw = window.innerWidth;
    const selectors = [
      ".workspace-shell",
      ".chat-header",
      ".chat-header-start",
      ".chat-header-end",
      ".chat-composer",
      ".composer-shell",
      ".composer-toolbar",
      ".composer-tools",
      ".composer-actions",
      ".chat-messages",
      ".chat-empty-title",
      "main#main-content",
    ];
    const offenders: string[] = [];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > vw + slack || rect.left < -slack) {
        offenders.push(
          `${selector} left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)} vw=${vw}`,
        );
      }
    }
    const main = document.getElementById("main-content");
    if (main) {
      const controls = main.querySelectorAll("button, a, input, textarea, [role='button']");
      for (const node of controls) {
        const style = window.getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const rect = node.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        if (rect.right > vw + slack) {
          const name =
            node.getAttribute("aria-label") ||
            node.getAttribute("title") ||
            node.tagName.toLowerCase();
          offenders.push(`control "${name}" right=${rect.right.toFixed(1)} vw=${vw}`);
        }
      }
    }
    return offenders;
  }, SLACK_PX);

  expect(report, "no horizontal overflow or crushed chrome").toEqual([]);
}

export async function assertNoToolbarOverlap(page: Page): Promise<void> {
  const pairs = await page.evaluate((slack) => {
    const toolbar = document.querySelector(".composer-toolbar");
    if (!toolbar) return ["missing .composer-toolbar"];
    const buttons = [...toolbar.querySelectorAll("button")].filter((node) => {
      const style = window.getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 2 && rect.height > 2;
    });
    const hits: string[] = [];
    for (let i = 0; i < buttons.length; i += 1) {
      for (let j = i + 1; j < buttons.length; j += 1) {
        const a = buttons[i]!.getBoundingClientRect();
        const b = buttons[j]!.getBoundingClientRect();
        const overlap = !(
          a.right <= b.left + slack ||
          a.left >= b.right - slack ||
          a.bottom <= b.top + slack ||
          a.top >= b.bottom - slack
        );
        if (overlap) {
          const nameA = buttons[i]!.getAttribute("aria-label") ?? `btn-${i}`;
          const nameB = buttons[j]!.getAttribute("aria-label") ?? `btn-${j}`;
          hits.push(`${nameA} overlaps ${nameB}`);
        }
      }
    }
    return hits;
  }, SLACK_PX);

  expect(pairs, "composer toolbar buttons must not overlap").toEqual([]);
}

export async function computed(locator: Locator, prop: string): Promise<string> {
  return locator.evaluate((node, name) => window.getComputedStyle(node).getPropertyValue(name), prop);
}

export function px(value: string): number {
  return Number.parseFloat(value);
}

const TRACKER_GAP_PX = 8;

interface SvgInkBox {
  x: number;
  y: number;
  right: number;
  bottom: number;
}

/** Viewport box of the SVG's drawn ink, including overflow:visible strokes. */
export async function svgInkBox(locator: Locator): Promise<SvgInkBox> {
  return locator.evaluate((node) => {
    const svg = node as unknown as SVGSVGElement;
    const box = svg.getBBox();
    const matrix = svg.getScreenCTM();
    if (!matrix) {
      throw new Error("SVG has no screen CTM");
    }
    const corners = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x, y: box.y + box.height },
      { x: box.x + box.width, y: box.y + box.height },
    ].map((point) => ({
      x: matrix.a * point.x + matrix.c * point.y + matrix.e,
      y: matrix.b * point.x + matrix.d * point.y + matrix.f,
    }));
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  });
}

export async function pinLandingStoryPanel(page: Page, index: number): Promise<void> {
  await page.locator("#boot-loader").waitFor({ state: "detached", timeout: 8_000 }).catch(() => undefined);
  await expect(page.locator("#nav")).toHaveClass(/in/, { timeout: 25_000 });
  await page.evaluate((panelIndex) => {
    const section = document.getElementById("story");
    const pane = document.querySelector<HTMLElement>("#story .story-sticky");
    if (!section || !pane) {
      throw new Error("Story section is missing");
    }
    const total = section.offsetHeight - pane.offsetHeight;
    const count = section.querySelectorAll(".story-panel").length;
    const progress = count > 1 ? panelIndex / (count - 1) : 0;
    window.scrollTo(0, section.offsetTop + progress * total);
  }, index);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

export async function assertStoryGraphicClearsTracker(page: Page, panelIndex: number): Promise<void> {
  const panel = page.locator("#story-track .story-panel").nth(panelIndex);
  const svg = panel.locator(".story-visual svg");
  const tracker = page.locator(".story-prog");
  await expect(svg).toBeVisible();
  await expect(tracker).toBeVisible();

  const ink = await svgInkBox(svg);
  const track = await boxOf(tracker);
  expect(ink.bottom, `panel ${panelIndex} graphic vs tracker`).toBeLessThanOrEqual(track.y - TRACKER_GAP_PX);
  expect(ink.y, `panel ${panelIndex} graphic stays in the pane`).toBeGreaterThanOrEqual(0);
}

export async function assertAuthFitsViewport(page: Page): Promise<void> {
  await page.locator("#boot-loader").waitFor({ state: "detached", timeout: 8_000 }).catch(() => undefined);
  const shell = page.locator(".auth-shell");
  const card = page.locator(".auth-glass");
  await expect(shell).toBeVisible();
  await expect(card).toBeVisible();

  const overflow = await page.evaluate((slack) => {
    const vw = window.innerWidth;
    const hits: string[] = [];
    const root = document.querySelector(".auth-shell");
    if (!root) return ["missing .auth-shell"];
    const nodes = root.querySelectorAll("a, button, input, nav, h1, .auth-glass, .auth-main");
    for (const node of nodes) {
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      if (rect.right > vw + slack || rect.left < -slack) {
        const name =
          node.getAttribute("aria-label") ||
          (node.textContent ?? "").trim().slice(0, 40) ||
          node.tagName.toLowerCase();
        hits.push(`${name} left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)} vw=${vw}`);
      }
    }
    const doc = document.documentElement;
    if (doc.scrollWidth > vw + slack) {
      hits.push(`document scrollWidth=${doc.scrollWidth} vw=${vw}`);
    }
    return hits;
  }, SLACK_PX);
  expect(overflow, "auth chrome stays in the viewport").toEqual([]);
}
