import { test, expect } from "@playwright/test";
import { openEmptyChat } from "../helpers/chat";

test.describe("Composer accessibility", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("message field is a textbox without aria-expanded", async ({ page }) => {
    await openEmptyChat(page);

    const input = page.locator("#composer-input");
    await expect(input).toHaveAttribute("aria-label", "Message");
    await expect(input).toHaveAttribute("aria-autocomplete", "list");
    await expect(input).not.toHaveAttribute("aria-expanded");
  });

  test("model trigger accessible name includes the visible model", async ({ page }) => {
    await openEmptyChat(page);

    const trigger = page.locator("button.model-selector-trigger");
    await expect(trigger).toHaveText(/Qwen 3.8 27B/);
    await expect(trigger).toHaveAttribute("aria-label", "Select model: Qwen 3.8 27B");
  });
});
