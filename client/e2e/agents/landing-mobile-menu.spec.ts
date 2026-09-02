import { test, expect } from "@playwright/test";
import { assertInsideViewport, computed, px } from "../helpers/layout";

const VIEWPORTS = [
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
  { name: "tiny", width: 320, height: 568 },
] as const;

async function openLandingMenu(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#nav")).toHaveClass(/in/, { timeout: 25_000 });
  const burger = page.getByRole("button", { name: "Open menu" });
  await expect(burger).toBeVisible();
  await burger.click();
  await expect(page.locator("#mobile-menu")).toHaveClass(/open/);
}

for (const viewport of VIEWPORTS) {
  test.describe(`Landing mobile menu — ${viewport.name} ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("drawer links and CTAs fit without crushing or horizontal overflow", async ({ page }) => {
      await openLandingMenu(page);

      const menu = page.locator("#mobile-menu");
      for (const label of ["Product", "Models", "Features", "API", "Pricing", "Sign in"]) {
        await expect(menu.getByRole("link", { name: label })).toBeVisible();
      }

      const primary = menu.locator(".mm-cta .btn-primary");
      const signIn = menu.locator(".mm-cta .btn-ghost");
      await expect(primary).toBeVisible();
      await expect(signIn).toBeVisible();

      expect(px(await computed(primary, "font-size"))).toBeLessThanOrEqual(16);
      expect(px(await computed(signIn, "font-size"))).toBeLessThanOrEqual(16);
      expect(px(await computed(primary, "min-height"))).toBeGreaterThanOrEqual(40);

      await assertInsideViewport(primary, "menu primary CTA");
      await assertInsideViewport(signIn, "menu Sign in");

      const overflow = await page.evaluate((slack) => {
        const vw = window.innerWidth;
        const root = document.querySelector("#mobile-menu");
        if (!root) return ["missing #mobile-menu"];
        const hits: string[] = [];
        for (const node of root.querySelectorAll("a, .btn")) {
          const rect = node.getBoundingClientRect();
          if (rect.width < 2) continue;
          if (rect.right > vw + slack || rect.left < -slack) {
            hits.push(`${(node.textContent ?? "").trim()} right=${rect.right.toFixed(1)} vw=${vw}`);
          }
        }
        return hits;
      }, 1.5);
      expect(overflow, "menu contents stay in the viewport").toEqual([]);

      if (viewport.width < 768) {
        const primaryBox = await primary.boundingBox();
        const signInBox = await signIn.boundingBox();
        expect(primaryBox && signInBox).toBeTruthy();
        if (primaryBox && signInBox) {
          expect(signInBox.y).toBeGreaterThan(primaryBox.y + primaryBox.height - 2);
        }
      }
    });
  });
}
