import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DUMP = process.env.LANDING_LAYOUT_DUMP === "1";
const HERE = dirname(fileURLToPath(import.meta.url));
const BASELINE = resolve(HERE, "../fixtures/landing-mobile-layout.json");

const VIEWPORTS = [
  { name: "phone", width: 320, height: 568 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
] as const;

type LayoutShot = {
  viewport: string;
  loops: number;
  clones: number;
  cap: { display: string; columns: string; count: number };
  api: { display: string; columns: string; count: number };
  trust: { display: string; columns: string; count: number };
  perf: { display: string; columns: string };
  price: { display: string; columns: string; names: string[] };
  verbs: { wrap: string; fontSize: string; padding: string };
  productPadding: { top: string; bottom: string };
  splitGap: string;
};

async function openLanding(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.locator("#boot-loader").waitFor({ state: "detached", timeout: 8_000 }).catch(() => undefined);
  await expect(page.locator("#nav")).toHaveClass(/in/, { timeout: 25_000 });
}

async function captureLayout(page: Page, viewport: string): Promise<LayoutShot> {
  return page.evaluate((name) => {
    const style = (sel: string): CSSStyleDeclaration => {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`missing ${sel}`);
      return getComputedStyle(el);
    };
    const cap = style(".cap-grid");
    const api = style(".api-list");
    const trust = style(".trust-grid");
    const perf = style(".perf-steps");
    const price = style(".price-grid");
    const verbs = style(".verb-list");
    const verb = style(".verb");
    const product = style("#product");
    const split = style(".split");
    return {
      viewport: name,
      loops: document.querySelectorAll(".loop").length,
      clones: document.querySelectorAll(".loop-clone").length,
      cap: {
        display: cap.display,
        columns: cap.gridTemplateColumns,
        count: document.querySelectorAll(".cap-grid .cap").length,
      },
      api: {
        display: api.display,
        columns: api.gridTemplateColumns,
        count: document.querySelectorAll(".api-list .api-item").length,
      },
      trust: {
        display: trust.display,
        columns: trust.gridTemplateColumns,
        count: document.querySelectorAll(".trust-grid .trust").length,
      },
      perf: { display: perf.display, columns: perf.gridTemplateColumns },
      price: {
        display: price.display,
        columns: price.gridTemplateColumns,
        names: [...document.querySelectorAll(".price-grid .plan h4")].map((h) => h.textContent ?? ""),
      },
      verbs: { wrap: verbs.flexWrap, fontSize: verb.fontSize, padding: verb.padding },
      productPadding: { top: product.paddingTop, bottom: product.paddingBottom },
      splitGap: split.gap,
    };
  }, viewport);
}

test.describe.configure({ mode: "serial" });

test("landing mobile/tablet layout matches the committed page", async ({ page }) => {
  const shots: Record<string, LayoutShot> = {};

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openLanding(page);
    shots[viewport.name] = await captureLayout(page, viewport.name);
  }

  if (DUMP || !existsSync(BASELINE)) {
    mkdirSync(dirname(BASELINE), { recursive: true });
    writeFileSync(BASELINE, `${JSON.stringify(shots, null, 2)}\n`);
    if (DUMP) return;
  }

  const expected = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, LayoutShot>;
  expect(shots).toEqual(expected);

  await expect(page.getByRole("heading", { name: "KEN AI", level: 1 })).toBeVisible();
  expect(await page.locator(".drop-letter").count()).toBe(0);
  expect(await page.locator(".impact-line").count()).toBe(0);
});
