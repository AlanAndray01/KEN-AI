import type { Page } from "@playwright/test";
import { DEMO_CONVERSATION, DEMO_MESSAGES, DEMO_MODEL, DEMO_USER } from "../helpers/demoAccount";
import { installMockSession } from "../helpers/mockSession";

export const IMAGE_NAME = "responsive-square.svg";
export const IMAGE_THREAD = "responsive-image";
const timestamp = "2026-10-05T08:00:00.000Z";
const square = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#083c32"/>
  <path d="M0 0L1024 1024M1024 0L0 1024" stroke="#22ef70" stroke-width="24"/>
  <rect x="32" y="32" width="960" height="960" fill="none" stroke="white" stroke-width="12"/>
  <text x="512" y="510" text-anchor="middle" font-family="sans-serif" font-size="68" fill="white">1024 × 1024</text>
  <text x="512" y="600" text-anchor="middle" font-family="sans-serif" font-size="44" fill="white">Responsive test fixture</text>
</svg>`;
const file = { id: "square-file", originalName: IMAGE_NAME, mimeType: "image/svg+xml", size: square.length,
  kind: "image", status: "ready", createdAt: timestamp, updatedAt: timestamp };
const gpt = { id: "responsive-gpt", name: "Responsive QA assistant", description: "A populated GPT detail fixture for layout tests.",
  instructions: "Explain concepts clearly.", conversationStarters: ["Explain responsive design", "Review a layout"],
  knowledgeFileIds: [], capabilities: ["text"], modelId: DEMO_MODEL.id, providerId: "groq",
  creatorId: DEMO_USER.id, visibility: "public", category: "productivity", mine: true, createdAt: timestamp, updatedAt: timestamp };
const models = [DEMO_MODEL, { ...DEMO_MODEL, providerId: "cloudflare", id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", name: "Llama 3.3 70B (Cloudflare)" },
  { ...DEMO_MODEL, providerId: "gemini", id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" }];
const totals = { requests: 24, inputTokens: 1600, outputTokens: 400, successes: 24, failures: 0 };
const group = { ...totals, key: "cloudflare:llama", providerId: "cloudflare", modelId: models[1].id };
const usage = { totals, byProvider: [group], byModel: [group], recent: [
  { id: "usage-fixture", providerId: "cloudflare", modelId: models[1].id, requestCount: 1, success: true, createdAt: timestamp },
] };

/** All API calls are intercepted. No credentials, database, or inference calls. */
export async function installResponsiveFixtures(page: Page, role: "guest" | "user" | "admin"): Promise<string[]> {
  const unexpected: string[] = [];
  await installMockSession(page);
  await page.route(url => url.pathname.startsWith("/api/"), async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api/, "");
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/me" || path === "/auth/refresh") {
      return role === "guest" ? json({ error: { code: "UNAUTHENTICATED", message: "Guest fixture" } }, 401)
        : json({ user: { ...DEMO_USER, role } });
    }
    if (request.method() !== "GET") {
      unexpected.push(`${request.method()} ${path}`);
      return json({ error: { code: "TEST_MUTATION_BLOCKED", message: "Responsive audits do not mutate data" } }, 405);
    }
    if (path === "/models" || path === "/admin/models") return json({ models });
    if (path === "/providers" || path === "/admin/providers") return json({ providers: [
      { id: "groq", providerId: "groq", name: "Groq", type: "openai-compatible", enabled: true,
        configured: true, capabilities: ["text", "streaming"], source: "environment", baseUrl: "https://api.groq.com/openai/v1" },
    ] });
    if (path === "/conversations") return json({ conversations: [DEMO_CONVERSATION,
      { ...DEMO_CONVERSATION, id: IMAGE_THREAD, title: "Square image layout" }] });
    if (path === `/conversations/${IMAGE_THREAD}`) return json({ conversation: { ...DEMO_CONVERSATION, id: IMAGE_THREAD, title: "Square image layout" } });
    if (path === `/conversations/${IMAGE_THREAD}/messages`) return json({ messages: [
      { ...DEMO_MESSAGES[0], conversationId: IMAGE_THREAD, content: "Show a square image." },
      { ...DEMO_MESSAGES[1], conversationId: IMAGE_THREAD, content: "", attachments: [{ ...file, fileId: file.id }] },
    ], hasMore: false });
    if (path === `/files/${file.id}/content`) return route.fulfill({ contentType: "image/svg+xml", body: square });
    if (path === "/files") return json({ files: [file] });
    if (path === "/gpts") return json({ gpts: [gpt] });
    if (path === `/gpts/${gpt.id}`) return json({ gpt });
    if (path.startsWith("/share/")) return json({ readOnly: true, conversation: {
      title: "Responsive shared conversation", createdAt: timestamp, messages: DEMO_MESSAGES,
    } });
    if (path === "/admin/usage" || path === "/me/usage") return json({ usage });
    if (path === "/memories") return json({ memories: [{ id: "memory-fixture", content: "I prefer concise explanations.", source: "manual", createdAt: timestamp, updatedAt: timestamp }] });
    if (path === "/me/instructions") return json({ instructions: { aboutUser: "QA tester", howToRespond: "Be concise.", additional: "", updatedAt: timestamp } });
    if (path === "/notifications") return json({ notifications: [{ id: "notification-fixture", type: "system", title: "Responsive audit", body: "A populated notification for layout coverage.", createdAt: timestamp }] });
    // Known common endpoints already have fixtures in the unchanged E2E helper.
    if (/^\/(conversations\/[^/]+(?:\/messages)?|tools(?:\/.*)?|voice\/status|me\/provider-credentials)$/.test(path)) return route.fallback();
    unexpected.push(`GET ${path}`);
    return json({ error: { code: "MISSING_TEST_FIXTURE", message: path } }, 501);
  });
  // Block external traffic even if the user's existing Vite server points at a deployed API.
  await page.route(url => !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), async route => {
    if (new URL(route.request().url()).pathname.startsWith("/api/")) return route.fallback();
    await route.abort("blockedbyclient");
  });
  return unexpected;
}
