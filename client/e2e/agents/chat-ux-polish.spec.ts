import { test, expect, type Page, type Request } from "@playwright/test";
import { DEMO_CONVERSATION_ID, DEMO_MODEL, DEMO_USER } from "../helpers/demoAccount";
import { installMockSession } from "../helpers/mockSession";
import { assertNoHorizontalOverflow, boxOf, computed, px } from "../helpers/layout";

const now = "2026-09-02T10:00:00.000Z";

const WIDE_TABLE = [
  "| Part | Vehicle | Position | Engine | Years | OEM number | Notes |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "| Wheel hub bearing assembly | Chevrolet Silverado 1500 | Front Right | 5.3L V8 | 2014-2018 | 515152 | Includes tone ring and mounting bolts |",
  "| Lower control arm with ball joint | Chevrolet Tahoe | Front Left | 6.2L V8 | 2015-2020 | 522-1001 | Pre-installed bushings |",
].join("\n");

const THREAD = [
  {
    id: "msg-user-file",
    conversationId: DEMO_CONVERSATION_ID,
    role: "user",
    content: "Hey so give me the content of this file",
    status: "complete",
    createdAt: now,
    updatedAt: now,
    attachments: [
      {
        id: "att-1",
        fileId: "file-1",
        originalName: "prompt.txt",
        mimeType: "text/plain",
        size: 512,
        kind: "document",
      },
    ],
  },
  {
    id: "msg-assistant-table",
    conversationId: DEMO_CONVERSATION_ID,
    role: "assistant",
    content: `Here is the parts table:\n\n${WIDE_TABLE}`,
    status: "complete",
    model: DEMO_MODEL.id,
    provider: DEMO_MODEL.providerId,
    createdAt: now,
    updatedAt: now,
  },
];

function json(body: unknown) {
  return { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

/** True for the two endpoints a chat submission can hit. */
function isSendRequest(request: Request): boolean {
  if (request.method() !== "POST") return false;
  const { pathname } = new URL(request.url());
  return /\/api\/(chat|conversations\/[^/]+\/messages)$/.test(pathname);
}

async function openThread(page: Page, options: { sendOnEnter?: boolean } = {}): Promise<void> {
  await installMockSession(page);
  // Registered after the shared mock, so Playwright matches these first.
  await page.route(
    (url) => url.pathname.endsWith(`/conversations/${DEMO_CONVERSATION_ID}/messages`),
    (route) => (route.request().method() === "GET" ? route.fulfill(json({ messages: THREAD })) : route.fallback()),
  );
  if (options.sendOnEnter !== undefined) {
    const user = { ...DEMO_USER, preferences: { ...DEMO_USER.preferences, sendOnEnter: options.sendOnEnter } };
    await page.route(
      (url) => /\/auth\/(me|refresh)$/.test(url.pathname),
      (route) => route.fulfill(json({ user })),
    );
  }
  await page.goto(`/chat/${DEMO_CONVERSATION_ID}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("form", { name: "Send message" })).toBeVisible({ timeout: 20_000 });
  await page.locator("#boot-loader").waitFor({ state: "detached", timeout: 8_000 }).catch(() => undefined);
  await expect(page.locator(".markdown-table-wrap").first()).toBeVisible();
}

test.describe("Chat UX polish — desktop", () => {
  test("attachments render above the user's text inside the bubble", async ({ page }) => {
    await openThread(page);
    const bubble = page.locator(".user-message").first();
    const chips = bubble.getByRole("list", { name: "Message attachments" });
    const text = bubble.getByText("Hey so give me the content of this file");
    await expect(chips).toBeVisible();

    const chipsBox = await boxOf(chips);
    const textBox = await boxOf(text);
    expect(chipsBox.bottom, "attachment list ends above the text").toBeLessThanOrEqual(textBox.y + 1);
  });

  test("Enter inserts a newline and never sends; Ctrl+Enter sends", async ({ page }) => {
    await openThread(page);
    const sends: string[] = [];
    page.on("request", (request) => {
      if (isSendRequest(request)) sends.push(request.url());
    });

    const input = page.locator("#composer-input");
    await expect(input).toHaveAttribute("enterkeyhint", "enter");
    await input.click();
    await page.keyboard.type("first line");
    await page.keyboard.press("Enter");
    await page.keyboard.type("second line");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("third line");

    // Submitting clears the draft synchronously, so an intact multi-line value
    // proves neither key reached onSubmit.
    await expect(input).toHaveValue("first line\nsecond line\nthird line");
    expect(sends, "plain Enter / Shift+Enter must not send").toEqual([]);

    const sent = page.waitForRequest(isSendRequest);
    await page.keyboard.press("Control+Enter");
    await sent;
    await expect(input).toHaveValue("");
  });

  test("message turns sit 16px apart", async ({ page }) => {
    await openThread(page);
    expect(px(await computed(page.locator(".chat-thread").last(), "row-gap"))).toBeCloseTo(16, 0);
  });
});

const SMALL_SCREENS = [
  { name: "tablet", width: 768, height: 1024, gap: 16 },
  { name: "phone", width: 390, height: 844, gap: 12 },
  { name: "small-phone", width: 320, height: 568, gap: 12 },
] as const;

// Playwright launches Chromium with --hide-scrollbars, which zeroes every
// scrollbar regardless of CSS, so the table-gutter check below could never
// pass. Launch options force a new worker, so Playwright only accepts them at
// file level; nothing else in this file depends on hidden scrollbars.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

for (const viewport of SMALL_SCREENS) {
  test.describe(`Chat UX polish — ${viewport.name} ${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test("wide tables keep a visible horizontal scrollbar", async ({ page }) => {
      await openThread(page);
      const wrap = page.locator(".markdown-table-wrap").first();
      const metrics = await wrap.evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          overflowing: node.scrollWidth > node.clientWidth,
          // offsetHeight includes borders and the scrollbar; clientHeight excludes both.
          gutter:
            node.offsetHeight -
            node.clientHeight -
            Number.parseFloat(style.borderTopWidth) -
            Number.parseFloat(style.borderBottomWidth),
          scrollbarWidth: style.getPropertyValue("scrollbar-width"),
        };
      });
      expect(metrics.overflowing, "table is wider than its container at this width").toBe(true);
      expect(metrics.scrollbarWidth).toBe("auto");
      // A persistent scrollbar reserves layout space; an auto-hiding overlay bar reserves 0.
      expect(metrics.gutter, "scrollbar occupies a real gutter").toBeGreaterThanOrEqual(8);
      await assertNoHorizontalOverflow(page);
    });

    test("action rows stay compact with full-height tap targets and no overlap", async ({ page }) => {
      await openThread(page);
      expect(px(await computed(page.locator(".chat-thread").last(), "row-gap"))).toBeCloseTo(viewport.gap, 0);

      const report = await page.locator(".assistant-actions").first().evaluate((toolbar) => {
        const buttons = [...toolbar.querySelectorAll("button")];
        return buttons.map((button) => {
          const rect = button.getBoundingClientRect();
          const after = window.getComputedStyle(button, "::after");
          const icon = button.querySelector("svg")?.getBoundingClientRect();
          const slopTop = after.content === "none" ? 0 : -Number.parseFloat(after.top || "0");
          const slopBottom = after.content === "none" ? 0 : -Number.parseFloat(after.bottom || "0");
          return {
            name: button.getAttribute("aria-label") ?? "",
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
            hitHeight: rect.height + Math.max(0, slopTop) + Math.max(0, slopBottom),
            iconWidth: icon?.width ?? 0,
          };
        });
      });

      expect(report.length).toBe(5);
      for (let index = 0; index < report.length; index += 1) {
        const item = report[index];
        if (!item) continue;
        expect(item.width, `${item.name} width`).toBeGreaterThanOrEqual(24);
        if (viewport.width < 768) {
          expect(item.height, `${item.name} visual height`).toBeLessThanOrEqual(40);
          expect(item.hitHeight, `${item.name} tap height`).toBeGreaterThanOrEqual(48);
          expect(item.iconWidth, `${item.name} icon`).toBeLessThanOrEqual(14.5);
        }
        const next = report[index + 1];
        if (next) {
          expect(item.right, `${item.name} does not overlap ${next.name}`).toBeLessThanOrEqual(next.left + 1);
        }
      }
      await assertNoHorizontalOverflow(page);
    });
  });
}

test.describe("Chat UX polish — touch keyboard", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("the return key adds a newline even when Enter-to-send is on", async ({ page }) => {
    await openThread(page, { sendOnEnter: true });
    const coarse = await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches);
    expect(coarse, "touch emulation reports a coarse pointer").toBe(true);

    const sends: string[] = [];
    page.on("request", (request) => {
      if (isSendRequest(request)) sends.push(request.url());
    });

    const input = page.locator("#composer-input");
    await input.tap();
    await page.keyboard.type("line one");
    await page.keyboard.press("Enter");
    await page.keyboard.type("line two");
    await expect(input).toHaveValue("line one\nline two");
    expect(sends).toEqual([]);
  });
});
