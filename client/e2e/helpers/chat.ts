import { expect, type Page } from "@playwright/test";
import { DEMO_CONVERSATION_ID } from "./demoAccount";
import { installMockSession } from "./mockSession";

export async function openWorkspace(page: Page, path = "/chat"): Promise<void> {
  await installMockSession(page);
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("form", { name: "Send message" })).toBeVisible({
    timeout: 20_000,
  });
  await page.locator("#boot-loader").waitFor({ state: "detached", timeout: 8_000 }).catch(() => undefined);
}

export async function openEmptyChat(page: Page): Promise<void> {
  await openWorkspace(page, "/chat");
  await expect(page.getByRole("heading", { name: "Chat" })).toBeVisible();
}

export async function openDemoThread(page: Page): Promise<void> {
  await openWorkspace(page, `/chat/${DEMO_CONVERSATION_ID}`);
  await expect(page.getByRole("heading", { name: "QA demo thread" })).toBeVisible();
  await expect(page.getByText("Hello Ken — this is a short QA prompt.")).toBeVisible();
}

export const COMPOSER_BUTTONS = [
  "Attach files",
  "Web search",
  "Generate image",
  "Voice input",
  "Live voice chat",
  "Send",
] as const;
