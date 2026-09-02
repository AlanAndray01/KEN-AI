import type { Page, Route } from "@playwright/test";
import {
  DEMO_CONVERSATION,
  DEMO_CONVERSATION_ID,
  DEMO_MESSAGES,
  DEMO_MODEL,
  DEMO_USER,
} from "./demoAccount";

const JSON_HEADERS = { "content-type": "application/json" };

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

function apiPath(url: string): string {
  const { pathname } = new URL(url);
  return pathname.replace(/^\/api(?=\/)/, "");
}

/**
 * Intercepts the Ken API so Playwright can open the workspace without a real
 * login, Mongo session, or running Express process.
 */
export async function installMockSession(page: Page): Promise<void> {
  await page.route(/\/api\//, async (route) => {
    const request = route.request();
    const path = apiPath(request.url());
    const method = request.method();

    if (path === "/auth/me" && method === "GET") {
      return json(route, { user: DEMO_USER });
    }
    if (path === "/auth/refresh" && method === "POST") {
      return json(route, { user: DEMO_USER });
    }
    if (path === "/auth/logout" && method === "POST") {
      return json(route, { ok: true });
    }
    if (path === "/auth/login" && method === "POST") {
      return json(route, { user: DEMO_USER });
    }

    if (path === "/models" && method === "GET") {
      return json(route, { models: [DEMO_MODEL] });
    }

    if (path === "/conversations" && method === "GET") {
      return json(route, { conversations: [DEMO_CONVERSATION] });
    }

    const conversationMatch = path.match(/^\/conversations\/([^/]+)$/);
    if (conversationMatch && method === "GET") {
      return json(route, { conversation: DEMO_CONVERSATION });
    }

    const messagesMatch = path.match(/^\/conversations\/([^/]+)\/messages$/);
    if (messagesMatch && method === "GET") {
      const id = messagesMatch[1];
      return json(route, {
        messages: id === DEMO_CONVERSATION_ID ? DEMO_MESSAGES : [],
      });
    }

    if (path.startsWith("/tools") && method === "GET") {
      return json(route, {
        tools: [
          {
            id: "web_search",
            name: "Web search",
            description: "Search",
            configured: false,
            available: false,
            unavailableReason: "Web search is not configured.",
          },
          {
            id: "image_generation",
            name: "Image generation",
            description: "Generate",
            configured: false,
            available: false,
            unavailableReason: "Image generation is not configured.",
          },
          {
            id: "data_analysis",
            name: "Data analysis",
            description: "Analyze",
            configured: false,
            available: false,
            unavailableReason: "Isolated data-analysis sandbox is not configured.",
          },
        ],
      });
    }

    if (path === "/voice/status" && method === "GET") {
      return json(route, {
        sttConfigured: false,
        ttsConfigured: false,
        message: "Voice is not configured.",
      });
    }

    if (path.startsWith("/gpts") && method === "GET") {
      return json(route, { gpts: [] });
    }

    if (path === "/files" && method === "GET") {
      return json(route, { files: [] });
    }

    if (path === "/me/provider-credentials" && method === "GET") {
      return json(route, { credentials: [] });
    }

    if (path === "/notifications" && method === "GET") {
      return json(route, { notifications: [] });
    }

    if (method === "GET") {
      return json(route, {});
    }

    return json(route, { ok: true });
  });
}
