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

    // Whatever the trigger shows (a pinned model, or "Auto" by default), a
    // screen reader must hear the same name.
    const trigger = page.locator("button.model-selector-trigger");
    const visible = (await trigger.innerText()).trim();
    expect(visible.length).toBeGreaterThan(0);
    await expect(trigger).toHaveAttribute("aria-label", `Select model: ${visible}`);
  });
});
