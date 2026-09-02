import { test, expect } from "@playwright/test";
import { DEMO_ACCOUNT } from "../helpers/demoAccount";
import { COMPOSER_BUTTONS, openEmptyChat } from "../helpers/chat";
import { assertInsideViewport, computed, px } from "../helpers/layout";

test.describe("Desktop Regression Agent", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("opens chat with the mocked demo session (no sign-in form)", async ({ page }) => {
    await openEmptyChat(page);
    await expect(page).toHaveURL(/\/chat$/);
    await expect(page.getByRole("form", { name: "Sign in" })).toHaveCount(0);
    await expect(page.getByText(DEMO_ACCOUNT.name)).toBeVisible();
  });

  test("keeps the original desktop chrome: sidebar rail, hint, 48px input, 36px send", async ({
    page,
  }) => {
    await openEmptyChat(page);

    const sidebar = page.getByRole("complementary", { name: "Workspace" });
    await expect(sidebar).toBeVisible();
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox?.x).toBeGreaterThanOrEqual(-1);
    expect(sidebarBox?.width).toBeGreaterThan(200);

    await expect(page.getByRole("button", { name: "Open sidebar" })).toBeHidden();

    const hint = page.locator(".composer-hint");
    await expect(hint).toBeVisible();
    await expect(hint).toContainText("Enter to send");
    expect(await computed(hint, "display")).not.toBe("none");

    const input = page.locator("#composer-input");
    expect(px(await computed(input, "min-height"))).toBeCloseTo(48, 0);

    const shell = page.locator(".composer-shell");
    expect(px(await computed(shell, "border-top-left-radius"))).toBeCloseTo(28, 0);

    const form = page.getByRole("form", { name: "Send message" });
    expect(px(await computed(form, "padding-left"))).toBeCloseTo(16, 0);
    expect(px(await computed(form, "padding-right"))).toBeCloseTo(16, 0);

    const send = page.getByRole("button", { name: "Send" });
    const sendBox = await send.boundingBox();
    expect(sendBox?.width).toBeCloseTo(36, 0);
    expect(sendBox?.height).toBeCloseTo(36, 0);

    const title = page.locator(".chat-empty-title");
    expect(px(await computed(title, "font-size"))).toBeCloseTo(30, 0);
  });

  test("desktop composer tools stay on one row with the keyboard hint", async ({ page }) => {
    await openEmptyChat(page);

    for (const name of COMPOSER_BUTTONS) {
      await assertInsideViewport(page.getByRole("button", { name }), name);
    }

    const hint = await page.locator(".composer-hint").boundingBox();
    const send = await page.getByRole("button", { name: "Send" }).boundingBox();
    expect(hint && send).toBeTruthy();
    if (hint && send) {
      expect(hint.y + hint.height / 2).toBeGreaterThan(send.y - 8);
      expect(hint.y + hint.height / 2).toBeLessThan(send.y + send.height + 8);
      expect(hint.x + hint.width).toBeLessThanOrEqual(send.x + 2);
    }
  });
});
