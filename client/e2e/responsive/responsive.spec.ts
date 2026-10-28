import { expect, test } from "@playwright/test";
import { DEMO_CONVERSATION_ID } from "../helpers/demoAccount";
import { assertLayout, scanLayout, scanSquareImage } from "./audit";
import { IMAGE_NAME, IMAGE_THREAD, installResponsiveFixtures } from "./fixtures";

type Scenario = { name: string; path: string; heading: string; role: "guest" | "user" | "admin"; source: string; state?: "image" | "viewer" | "model-menu" | "sidebar" | "gpt-editor" };
const publicPages = [
  ["Landing", "/", "KEN AI", "HomePage"], ["Privacy", "/privacy", "Privacy Policy", "PrivacyPage"],
  ["Terms", "/terms", "Terms of Service", "TermsPage"], ["Login", "/login", "Welcome back", "LoginPage"],
  ["Register", "/register", "Create your account", "RegisterPage"],
  ["Forgot password", "/forgot-password", "Forgot password", "ForgotPasswordPage"],
  ["Reset password", "/reset-password?email=qa%40ken.test", "Reset password", "ResetPasswordPage"],
  ["Verify email", "/verify-email?email=qa%40ken.test", "Enter the 6-digit code", "VerifyEmailPage"],
  ["Shared conversation", "/share/responsive-share", "Responsive shared conversation", "SharePage"],
  ["Not found", "/responsive-missing-page", "Page not found", "NotFoundPage"],
];
const workspacePages = [
  ["Empty chat", "/chat", "Chat", "ChatPage"],
  ["Text conversation", `/chat/${DEMO_CONVERSATION_ID}`, "QA demo thread", "ChatPage"],
  ["History", "/search", "History", "SearchPage"], ["History redirect", "/history", "History", "SearchPage"],
  ["Library", "/library", "Library", "LibraryPage"], ["GPTs", "/gpts", "GPTs", "GptsPage"],
  ["Create GPT", "/gpts/create", "Create a GPT", "GptCreatePage"],
  ["GPT detail", "/gpts/responsive-gpt", "Responsive QA assistant", "GptDetailPage"],
  ...[ ["", "Settings"], ["account", "Account"], ["general", "General"], ["appearance", "Appearance"],
    ["personalization", "Personalization"], ["memory", "Memory"], ["voice", "Voice"],
    ["notifications", "Notifications"], ["data-controls", "Data controls"], ["models", "API Keys & Models"] ].map(([slug, heading]) =>
      [`Settings ${slug || "overview"}`, `/settings${slug ? `/${slug}` : ""}`, heading,
        `settings/Settings${slug ? slug.split("-").map(word => word[0].toUpperCase() + word.slice(1)).join("") : ""}Page`]),
];
const scenarios: Scenario[] = [
  ...publicPages.map(([name, path, heading, source]) => ({ name, path, heading, source, role: "guest" as const })),
  ...workspacePages.map(([name, path, heading, source]) => ({ name, path, heading, source, role: "user" as const })),
  ...[ ["Providers", "/admin/providers", "AI providers", "AdminProvidersPage"],
    ["Models", "/admin/models", "Model registry", "AdminModelsPage"], ["Usage", "/admin/usage", "Usage", "AdminUsagePage"] ].map(([name, path, heading, source]) =>
    ({ name: `Admin ${name}`, path, heading, source: `admin/${source}`, role: "admin" as const })),
  ...(["image", "viewer"] as const).map(state => ({ name: state === "image" ? "Square image card" : "Square image viewer", path: `/chat/${IMAGE_THREAD}`,
    heading: "Square image layout", source: "ChatPage", role: "user" as const, state })),
  { name: "Model menu", path: "/chat", heading: "Chat", source: "ChatPage", role: "user", state: "model-menu" },
  { name: "Open sidebar", path: "/chat", heading: "Chat", source: "ChatPage", role: "user", state: "sidebar" },
  { name: "GPT editor", path: "/gpts/responsive-gpt", heading: "Responsive QA assistant", source: "GptDetailPage", role: "user", state: "gpt-editor" },
];

for (const scenario of scenarios) {
  test(`${scenario.name} (${scenario.path})`, async ({ page }, testInfo) => {
    const runtimeErrors: string[] = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    const unexpectedRequests = await installResponsiveFixtures(page, scenario.role);
    await page.goto(scenario.path);
    // Prevent measuring a loader, redirected login, or empty error page as a passing layout.
    await expect(page.getByRole("heading", { level: 1, name: scenario.heading, exact: true })).toBeVisible();
    if (scenario.path.startsWith("/chat")) {
      await expect(page.getByRole("form", { name: "Send message" })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Select model/ })).toBeEnabled();
      await expect(page.getByRole("region", { name: "Messages" })).toHaveAttribute("aria-busy", "false");
    }
    if (scenario.name === "Library") await expect(page.getByText(IMAGE_NAME, { exact: true })).toBeVisible();
    if (scenario.name === "GPTs") await expect(page.getByText("Responsive QA assistant", { exact: true })).toBeVisible();
    if (scenario.name === "Admin Usage") await expect(page.getByRole("heading", { name: "Recent generations" })).toBeVisible();
    if (scenario.name === "Admin Models") await expect(page.getByRole("checkbox", { name: "Enable Qwen 3.8 27B" })).toBeAttached();
    if (scenario.name === "Admin Providers") await expect(page.getByRole("heading", { name: "Groq", exact: true })).toBeVisible();
    if (scenario.state === "image" || scenario.state === "viewer") {
      const image = page.locator(`.assistant-turn img[alt="${IMAGE_NAME}"]`);
      await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth === 1024)).toBe(true);
      if (scenario.state === "viewer") {
        await page.getByRole("button", { name: `View ${IMAGE_NAME}`, exact: true }).click();
        await expect(page.getByRole("dialog", { name: IMAGE_NAME })).toBeVisible();
      }
    }
    if (scenario.state === "model-menu") {
      await page.getByRole("button", { name: /^Select model/ }).click();
      await expect(page.getByRole("listbox", { name: "Models" })).toBeVisible();
    }
    if (scenario.state === "sidebar" && testInfo.project.use.viewport!.width < 768) {
      await page.getByRole("button", { name: "Open sidebar" }).click();
      await expect.poll(() => page.getByRole("complementary", { name: "Workspace" }).evaluate(node => node.getBoundingClientRect().left)).toBe(0);
    }
    if (scenario.state === "gpt-editor") {
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await expect(page.getByRole("button", { name: "Save GPT" })).toBeVisible();
    }
    await page.evaluate(async () => { await document.fonts.ready; await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))); });
    expect(runtimeErrors, "Page crashed while preparing layout audit").toEqual([]);
    expect(unexpectedRequests, "Missing API fixtures or blocked mutation; layout coverage is incomplete").toEqual([]);
    const sourceHints = [`client/src/pages/${scenario.source}.tsx`, "client/src/app.css"];
    if (scenario.role !== "guest") sourceHints.push("client/src/layouts/WorkspaceLayout.tsx");
    if (scenario.state === "image" || scenario.state === "viewer") sourceHints.push("client/src/components/ChatTurn.tsx", "client/src/components/ChatImage.tsx", "client/src/components/AttachmentChips.tsx");
    if (scenario.state === "model-menu") sourceHints.push("client/src/components/ModelSelector.tsx");
    const audit = await scanLayout(page, scenario.name, sourceHints);
    if (scenario.state === "image") audit.issues.push(...await scanSquareImage(page));
    await assertLayout(page, testInfo, audit);
  });
}
