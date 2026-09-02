import { test, expect } from "@playwright/test";
import { COMPOSER_BUTTONS, openEmptyChat } from "../helpers/chat";
import { assertInsideViewport, assertNoHorizontalOverflow, computed } from "../helpers/layout";

const VIEWPORTS = [
  { name: "tablet-portrait", width: 768, height: 1024 },
  { name: "tablet-landscape", width: 1024, height: 768 },
  { name: "phone", width: 390, height: 844 },
  { name: "small-phone", width: 320, height: 568 },
] as const;

for (const viewport of VIEWPORTS) {
  test.describe(`Tablet & Mobile Viewport Agent — ${viewport.name} ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("scales chat chrome without horizontal overflow or crushed controls", async ({ page }) => {
      await openEmptyChat(page);
      await assertNoHorizontalOverflow(page);

      const isPhone = viewport.width < 768;
      const sidebarButton = page.getByRole("button", { name: "Open sidebar" });
      if (isPhone) {
        await expect(sidebarButton).toBeVisible();
        await assertInsideViewport(sidebarButton, "Open sidebar");
      } else {
        await expect(sidebarButton).toBeHidden();
        await expect(page.getByRole("complementary", { name: "Workspace" })).toBeVisible();
      }

      for (const name of COMPOSER_BUTTONS) {
        await assertInsideViewport(page.getByRole("button", { name }), name);
      }

      await assertInsideViewport(page.getByRole("button", { name: "Model" }), "Model selector");
      await assertInsideViewport(page.locator(".chat-header"), "chat header");
      await assertInsideViewport(page.locator(".chat-composer"), "composer");

      if (viewport.width <= 1023) {
        expect(await computed(page.locator(".composer-hint"), "display")).toBe("none");
      }
    });

    test("buttons and padding shrink instead of overflowing at this width", async ({ page }) => {
      await openEmptyChat(page);

      const form = page.getByRole("form", { name: "Send message" });
      const formBox = await form.boundingBox();
      expect(formBox).toBeTruthy();
      if (formBox) {
        expect(formBox.x).toBeGreaterThanOrEqual(-1);
        expect(formBox.x + formBox.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      const send = await page.getByRole("button", { name: "Send" }).boundingBox();
      expect(send).toBeTruthy();
      if (send) {
        expect(send.width).toBeGreaterThanOrEqual(28);
        expect(send.width).toBeLessThanOrEqual(40);
        expect(send.x + send.width).toBeLessThanOrEqual(viewport.width + 1);
      }

      const empty = page.locator(".chat-empty-title");
      await expect(empty).toBeVisible();
      const emptyBox = await empty.boundingBox();
      expect(emptyBox).toBeTruthy();
      if (emptyBox) {
        expect(emptyBox.x + emptyBox.width).toBeLessThanOrEqual(viewport.width + 1);
      }
    });
  });
}
