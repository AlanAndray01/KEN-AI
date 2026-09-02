import { test, expect } from "@playwright/test";
import { COMPOSER_BUTTONS, openDemoThread, openEmptyChat } from "../helpers/chat";
import {
  assertInsideViewport,
  assertNoHorizontalOverflow,
  assertNoToolbarOverlap,
  computed,
} from "../helpers/layout";

const SMALL_SCREENS = [
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
  { name: "tiny", width: 320, height: 568 },
] as const;

for (const viewport of SMALL_SCREENS) {
  test.describe(`Chat Interface Clutter Agent — ${viewport.name} ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("composer toolbar is a single uncluttered row with no overlapping actions", async ({
      page,
    }) => {
      await openEmptyChat(page);

      expect(await computed(page.locator(".composer-hint"), "display")).toBe("none");

      const toolbar = page.locator(".composer-toolbar");
      await expect(toolbar).toBeVisible();
      await assertInsideViewport(toolbar, "composer toolbar");
      await assertNoToolbarOverlap(page);

      const tools = page.locator(".composer-tools");
      const actions = page.locator(".composer-actions");
      const toolsBox = await tools.boundingBox();
      const actionsBox = await actions.boundingBox();
      expect(toolsBox && actionsBox).toBeTruthy();
      if (toolsBox && actionsBox) {
        expect(toolsBox.x + toolsBox.width).toBeLessThanOrEqual(actionsBox.x + 2);
        expect(Math.abs(toolsBox.y - actionsBox.y)).toBeLessThan(12);
      }

      for (const name of COMPOSER_BUTTONS) {
        await assertInsideViewport(page.getByRole("button", { name }), name);
      }

      await expect(page.getByRole("button", { name: "Attach files" })).toBeEnabled();
      await page.locator("#composer-input").fill("QA clutter check");
      await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
      await assertNoToolbarOverlap(page);
      await assertNoHorizontalOverflow(page);
    });

    test("message bubbles and assistant action toolbar stay usable", async ({ page }) => {
      await openDemoThread(page);
      await assertNoHorizontalOverflow(page);

      const userTurn = page.locator(".user-message");
      const assistantTurn = page.locator(".assistant-turn");
      await expect(userTurn).toBeVisible();
      await expect(assistantTurn).toBeVisible();
      await assertInsideViewport(userTurn, "user message");
      await assertInsideViewport(assistantTurn, "assistant message");

      const actions = ["Regenerate", "Copy", "Play audio", "Good response", "Bad response"] as const;
      const toolbar = page.locator(".assistant-actions");
      await expect(toolbar).toBeVisible();
      for (const name of actions) {
        await assertInsideViewport(toolbar.getByRole("button", { name }), name);
      }

      await assertInsideViewport(page.locator(".composer-toolbar"), "composer under a thread");
      await assertNoToolbarOverlap(page);
    });
  });
}
