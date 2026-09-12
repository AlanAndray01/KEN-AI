import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { mountApiHost } from "./apiHost.js";
import { notFoundHandler } from "./notFound.js";
import { errorHandler } from "./errorHandler.js";

/**
 * Search Console reported `https://api.ken-ai.tech/` under "Not found (404)".
 * The property is a domain property, so it covers every subdomain: the API host
 * is crawled whether or not anyone links to it. These tests pin both halves of
 * the fix — the root must answer, and nothing on this host may be indexable.
 */
function apiOnlyApp() {
  const app = express();
  mountApiHost(app);
  app.get("/api/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe("API host", () => {
  it("answers the root with 200 instead of a 404", async () => {
    const response = await request(apiOnlyApp()).get("/");

    expect(response.status).toBe(200);
    expect(response.body.service).toBe("Ken AI API");
    // Points a curious visitor (or a crawler following it) at the real site.
    expect(response.body.website).toBe("https://ken-ai.tech");
  });

  it("marks the root noindex, so answering 200 does not get it indexed", async () => {
    const response = await request(apiOnlyApp()).get("/");

    expect(response.headers["x-robots-tag"]).toContain("noindex");
  });

  it("marks every API response noindex too", async () => {
    const response = await request(apiOnlyApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.headers["x-robots-tag"]).toContain("noindex");
  });

  it("still marks a 404 on this host noindex", async () => {
    const response = await request(apiOnlyApp()).get("/nothing-here");

    expect(response.status).toBe(404);
    expect(response.headers["x-robots-tag"]).toContain("noindex");
  });

  it("serves a robots.txt as plain text", async () => {
    const response = await request(apiOnlyApp()).get("/robots.txt");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    expect(response.text).toMatch(/^User-agent: \*/m);
  });

  it("disallows the API but leaves the root crawlable", async () => {
    const response = await request(apiOnlyApp()).get("/robots.txt");

    expect(response.text).toContain("Disallow: /api/");
    // A blanket `Disallow: /` would stop Google fetching the root, and it would
    // then never see the noindex header that actually removes the URL.
    expect(response.text).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });

  it("points crawlers at the website rather than leaving them here", async () => {
    const response = await request(apiOnlyApp()).get("/robots.txt");

    expect(response.text).toContain("https://ken-ai.tech");
  });
});
