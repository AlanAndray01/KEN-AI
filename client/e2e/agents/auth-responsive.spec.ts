import { test, expect } from "@playwright/test";
import { assertAuthFitsViewport, assertInsideViewport } from "../helpers/layout";

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
  { name: "tiny", width: 320, height: 568 },
] as const;

const ROUTES = [
  { path: "/login", heading: "Welcome back", form: "Sign in" },
  { path: "/register", heading: "Create your account", form: "Create account" },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`Auth responsive — ${viewport.name} ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const route of ROUTES) {
      test(`${route.path} matches the landing card and fits the viewport`, async ({ page }) => {
        await page.goto(route.path, { waitUntil: "domcontentloaded" });
        await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();
        await expect(page.getByRole("form", { name: route.form })).toBeVisible();
        const nav = page.getByRole("navigation", { name: "Account" });
        const tabs = nav.getByRole("link");
        await expect(tabs).toHaveCount(3);
        await expect(nav.getByRole("link", { name: "Sign in" })).toBeVisible();
        await expect(nav.getByRole("link", { name: "Sign up" })).toBeVisible();
        await expect(nav.getByRole("link", { name: "Forgot password" })).toBeVisible();
        const navBox = await nav.boundingBox();
        const first = await tabs.nth(0).boundingBox();
        const last = await tabs.nth(2).boundingBox();
        expect(navBox && first && last).toBeTruthy();
        if (navBox && first && last) {
          expect(first.x, "first tab starts at the left of the pill").toBeLessThanOrEqual(navBox.x + 10);
          expect(last.x + last.width, "last tab reaches the right of the pill").toBeGreaterThanOrEqual(
            navBox.x + navBox.width - 10,
          );
        }
        const clipped = await page.evaluate(() => {
          const hits: string[] = [];
          for (const node of document.querySelectorAll(".auth-mode-nav a")) {
            if (node.scrollWidth > node.clientWidth + 1) {
              hits.push(`${(node.textContent ?? "").trim()} scroll=${node.scrollWidth} client=${node.clientWidth}`);
            }
          }
          return hits;
        });
        expect(clipped, "auth tabs must not clip their labels").toEqual([]);
        await expect(page.getByRole("link", { name: "Continue with Google" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();

        const card = page.locator(".auth-glass");
        await expect(card).toHaveCSS("border-top-color", /rgba?\(0,\s*255,\s*65/);

        const continueBtn = page.getByRole("button", { name: "Continue" });
        await continueBtn.scrollIntoViewIfNeeded();
        await assertInsideViewport(continueBtn, "Continue");
        await assertAuthFitsViewport(page);
      });
    }
  });
}
