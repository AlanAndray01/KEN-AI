import { test, expect } from "@playwright/test";
import { assertStoryGraphicClearsTracker, pinLandingStoryPanel } from "../helpers/layout";

test.describe("Landing story graphics vs tracker", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Build and Research glyphs keep original slot size but clear the green tracker", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await pinLandingStoryPanel(page, 0);
    const buildSlot = page.locator("#story-track .story-panel").nth(0).locator(".story-visual");
    await expect(buildSlot).toBeVisible();
    const buildHeight = (await buildSlot.boundingBox())?.height ?? 0;
    expect(buildHeight).toBeGreaterThan(200);

    await assertStoryGraphicClearsTracker(page, 0);

    await pinLandingStoryPanel(page, 1);
    await expect(page.locator("#story-label")).toHaveText(/RESEARCH/i);
    await assertStoryGraphicClearsTracker(page, 1);
  });
});

test.describe("Landing story graphics vs tracker — tablet", () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test("stacked story glyphs still clear the tracker", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await pinLandingStoryPanel(page, 0);
    await assertStoryGraphicClearsTracker(page, 0);
    await pinLandingStoryPanel(page, 1);
    await assertStoryGraphicClearsTracker(page, 1);
  });
});
