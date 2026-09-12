import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the search-engine surface of the app.
 *
 * These files are static and nothing else imports them, so a bad edit here
 * produces no type error and no failing component test — it just quietly
 * de-indexes the site. That is exactly how the original problem happened:
 * robots.txt and sitemap.xml did not exist at all, the SPA rewrite answered
 * /robots.txt with index.html at HTTP 200, and no part of the build complained.
 */
const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative: string): string =>
  readFileSync(path.join(clientDir, relative), "utf8");

const html = read("index.html");
const robots = read("public/robots.txt");
const sitemap = read("public/sitemap.xml");
const manifest = read("public/site.webmanifest");

const ORIGIN = "https://ken-ai.tech";

describe("index.html metadata", () => {
  it("names the brand in the title", () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
    expect(title).toContain("Ken AI");
    // Google truncates a result title around 60 characters.
    expect(title.length).toBeLessThanOrEqual(60);
  });

  it("carries a description of a length Google will actually show", () => {
    const description =
      /<meta\s+name="description"\s+content="([^"]+)"/.exec(html)?.[1] ??
      /<meta\s*\n\s*name="description"\s*\n\s*content="([^"]+)"/.exec(html)?.[1] ??
      "";
    expect(description).toContain("Ken AI");
    expect(description.length).toBeGreaterThan(70);
    expect(description.length).toBeLessThanOrEqual(170);
  });

  it("allows indexing and a large result image", () => {
    expect(html).toMatch(/name="robots"/);
    expect(html).toContain("max-image-preview:large");
    expect(html).not.toMatch(/content="[^"]*noindex/);
  });

  it("declares a canonical on the apex domain", () => {
    expect(html).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
  });

  it("ships Open Graph and Twitter cards with an absolute image", () => {
    for (const tag of ["og:type", "og:title", "og:description", "og:url", "og:image", "og:site_name"]) {
      expect(html, tag).toContain(`property="${tag}"`);
    }
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    // Scrapers do not resolve relative image paths.
    expect(html).toContain(`content="${ORIGIN}/og-image.png"`);
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
  });

  it("embeds structured data that parses and names the organisation", () => {
    const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1];
    expect(block).toBeTruthy();

    const parsed = JSON.parse(block as string) as {
      "@context": string;
      "@graph": Array<{ "@type": string; name?: string; alternateName?: string[] }>;
    };
    expect(parsed["@context"]).toBe("https://schema.org");

    const types = parsed["@graph"].map((node) => node["@type"]);
    expect(types).toContain("Organization");
    expect(types).toContain("WebSite");
    expect(types).toContain("SoftwareApplication");

    const org = parsed["@graph"].find((node) => node["@type"] === "Organization");
    expect(org?.name).toBe("Ken AI");
    // The spellings a person actually types into a search box.
    expect(org?.alternateName).toEqual(expect.arrayContaining(["KEN AI", "ken-ai.tech"]));
  });

  it("gives a non-rendering crawler real prose to read", () => {
    // There is more than one <noscript>: the first is the font stylesheet
    // fallback in <head>. Pick the one that actually carries body copy.
    const blocks = [...html.matchAll(/<noscript>([\s\S]*?)<\/noscript>/g)].map(
      (match) => match[1] ?? "",
    );
    const noscript = blocks.find((block) => block.includes("<h1>")) ?? "";
    expect(noscript, "no <noscript> block contains an <h1>").not.toBe("");
    expect(noscript).toContain("Ken AI");
    expect(noscript).toContain("ken-ai.tech");
    // Enough copy to be a page, not a placeholder.
    expect(noscript.replace(/<[^>]+>/g, " ").trim().length).toBeGreaterThan(400);
  });
});

describe("robots.txt", () => {
  it("allows crawling and points at the sitemap", () => {
    expect(robots).toMatch(/^User-agent:\s*\*/m);
    expect(robots).toMatch(/^Allow:\s*\//m);
    expect(robots).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  });

  it("never blocks the whole site", () => {
    expect(robots).not.toMatch(/^Disallow:\s*\/\s*$/m);
  });

  it("keeps session-only and user-owned surfaces out of the index", () => {
    for (const route of ["/chat", "/settings", "/admin", "/share/"]) {
      expect(robots, route).toContain(`Disallow: ${route}`);
    }
  });
});

describe("sitemap.xml", () => {
  it("uses the namespace Search Console requires", () => {
    // A wrong namespace here is rejected outright, with no partial credit.
    expect(sitemap).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
  });

  it("lists the public pages on the apex domain", () => {
    for (const url of ["/", "/login", "/register", "/privacy", "/terms"]) {
      expect(sitemap, url).toContain(`<loc>${ORIGIN}${url}</loc>`);
    }
  });

  it("lists no URL that robots.txt disallows", () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
    const disallowed = [...robots.matchAll(/^Disallow:\s*(\S+)/gm)].map((match) => match[1] ?? "");
    for (const loc of locs) {
      const pathname = new URL(loc).pathname;
      for (const rule of disallowed) {
        expect(pathname.startsWith(rule), `${loc} is disallowed by "${rule}"`).toBe(false);
      }
    }
  });

  it("uses absolute https URLs, which the spec requires", () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1] ?? "");
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      expect(loc.startsWith(`${ORIGIN}/`), loc).toBe(true);
    }
  });
});

describe("site.webmanifest", () => {
  it("parses and carries the brand name", () => {
    const parsed = JSON.parse(manifest) as { name: string; start_url: string };
    expect(parsed.name).toBe("Ken AI");
    expect(parsed.start_url).toBe("/");
  });
});
