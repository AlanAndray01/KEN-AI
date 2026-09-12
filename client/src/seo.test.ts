import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FAQS } from "./pages/landing/faqs";

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
const homePage = read("src/pages/HomePage.tsx");

const ORIGIN = "https://ken-ai.tech";

/** The @graph nodes from the JSON-LD block in index.html. */
function parseGraph(): Array<Record<string, unknown>> {
  const block = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
  return (JSON.parse(block) as { "@graph": Array<Record<string, unknown>> })["@graph"];
}

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

  it("leads the title with the brand and the tagline", () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
    expect(title.startsWith("Ken AI"), `title should lead with the brand: ${title}`).toBe(true);
    expect(title).toContain("Intelligence Without The Noise");
  });

  it("claims the brand spellings people actually type", () => {
    const graph = parseGraph();
    const org = graph.find((node) => node["@type"] === "Organization");
    // "Ken AI" is winnable; "Ken" alone competes with every other Ken alive.
    // Claiming the variations is still what ties the short form to this site.
    expect(org?.alternateName).toEqual(
      expect.arrayContaining(["KEN AI", "Ken", "Ken-AI", "ken-ai", "ken-ai.tech"]),
    );
    expect(org?.slogan).toContain("Intelligence without the noise");
  });

  it("declares the free plan as a real offer", () => {
    const app = parseGraph().find((node) => node["@type"] === "SoftwareApplication") as
      | { offers?: { price?: string; priceCurrency?: string; url?: string } }
      | undefined;
    expect(app?.offers?.price).toBe("0");
    expect(app?.offers?.priceCurrency).toBe("USD");
    expect(app?.offers?.url).toContain("ken-ai.tech");
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

/**
 * Google requires FAQPage markup to match the question and answer text the page
 * actually renders; markup describing FAQs a visitor cannot see is a guideline
 * violation and can cost the rich result outright. The schema lives in static
 * HTML while the copy lives in a module, so nothing but this test stops the two
 * drifting apart.
 */
describe("FAQPage structured data matches the rendered FAQ", () => {
  const faqNode = parseGraph().find((node) => node["@type"] === "FAQPage") as
    | { mainEntity?: Array<{ name: string; acceptedAnswer: { text: string } }> }
    | undefined;

  it("is present and covers every question on the page", () => {
    expect(faqNode?.mainEntity).toHaveLength(FAQS.length);
  });

  it("quotes each question and answer verbatim", () => {
    FAQS.forEach((faq, index) => {
      const entry = faqNode?.mainEntity?.[index];
      expect(
        entry?.name,
        `FAQ ${index} drifted. Regenerate the JSON-LD in client/index.html from client/src/pages/landing/faqs.ts`,
      ).toBe(faq.q);
      expect(entry?.acceptedAnswer.text).toBe(faq.a);
    });
  });

  it("answers the brand-name question first", () => {
    // The query a person searching "Ken AI" is really asking.
    expect(faqNode?.mainEntity?.[0]?.name).toBe("What is Ken AI?");
    expect(faqNode?.mainEntity?.[0]?.acceptedAnswer.text).toContain("ken-ai.tech");
  });
});

describe("landing page brand copy", () => {
  it("puts the brand name in the h1's text, not only an aria-label", () => {
    // The visible mark renders as two styled halves reading "KENAI"; a crawler
    // extracts text, so the spaced form has to exist in the DOM.
    expect(homePage).toMatch(/<span className="sr-only">Ken AI<\/span>/);
  });

  it("names the brand and domain in the hero copy", () => {
    expect(homePage).toContain("Ken AI");
    expect(homePage).toContain("ken-ai.tech");
  });

  it("keeps the tagline on the page", () => {
    expect(homePage).toContain("Intelligence without the noise.");
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

  it("declares square icons that exist on disk", () => {
    const parsed = JSON.parse(manifest) as {
      icons: Array<{ src: string; sizes: string }>;
    };
    expect(parsed.icons.length).toBeGreaterThan(0);
    for (const icon of parsed.icons) {
      // A non-square icon is rejected outright, which is what a 1200x630 card
      // used to be doing here — it made the app uninstallable.
      const [w, h] = icon.sizes.split("x");
      expect(w, icon.src).toBe(h);
      expect(
        existsSync(path.join(clientDir, "public", icon.src.replace(/^\//, ""))),
        `${icon.src} is declared in the manifest but missing from client/public`,
      ).toBe(true);
    }
  });
});

/**
 * The guard for the bug that put this file here in the first place.
 *
 * Excluding a path from the SPA rewrite stops it falling through to index.html.
 * That is the whole point — but if no real file sits at that path, the exclusion
 * turns a harmless 200 into a hard 404. Adding `favicon.ico` to the lookahead
 * without shipping a favicon is exactly how Search Console started reporting
 * "Not found (404)".
 */
describe("vercel rewrite exclusions", () => {
  const vercel = JSON.parse(
    readFileSync(path.resolve(clientDir, "..", "vercel.json"), "utf8"),
  ) as { rewrites: Array<{ source: string; destination: string }> };

  const source = vercel.rewrites[0]?.source ?? "";
  /** The literal filenames listed inside the negative lookahead. */
  const excluded = [...source.matchAll(/([\w-]+\\\.[a-z0-9]+)/g)].map((match) =>
    (match[1] ?? "").replace(/\\/g, ""),
  );

  it("excludes at least the SEO and icon assets", () => {
    expect(excluded).toEqual(
      expect.arrayContaining([
        "robots.txt",
        "sitemap.xml",
        "og-image.png",
        "site.webmanifest",
        "favicon.ico",
      ]),
    );
  });

  it("ships a real file for every excluded path", () => {
    for (const name of excluded) {
      expect(
        existsSync(path.join(clientDir, "public", name)),
        `/${name} is excluded from the SPA rewrite but no file exists in client/public — it will 404`,
      ).toBe(true);
    }
  });

  it("still rewrites application routes to index.html", () => {
    const re = new RegExp(`^${source}$`);
    for (const route of ["/", "/login", "/register", "/privacy", "/terms", "/chat/abc"]) {
      expect(re.test(route), `${route} should rewrite to index.html`).toBe(true);
    }
  });

  it("lets every excluded path bypass the rewrite", () => {
    const re = new RegExp(`^${source}$`);
    for (const name of excluded) {
      expect(re.test(`/${name}`), `/${name} should be served as a file`).toBe(false);
    }
  });
});

describe("icons referenced by index.html", () => {
  it("ships every icon the document links to by path", () => {
    const hrefs = [...html.matchAll(/<link[^>]*rel="(?:icon|apple-touch-icon)"[^>]*>/g)]
      .map((match) => /href="([^"]+)"/.exec(match[0])?.[1] ?? "")
      .filter((href) => href.startsWith("/"));
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(
        existsSync(path.join(clientDir, "public", href.replace(/^\//, ""))),
        `${href} is linked from index.html but missing from client/public`,
      ).toBe(true);
    }
  });

  it("ships a favicon.ico that is actually an ICO", () => {
    const ico = readFileSync(path.join(clientDir, "public", "favicon.ico"));
    expect(ico.readUInt16LE(0), "reserved field").toBe(0);
    expect(ico.readUInt16LE(2), "image type (1 = icon)").toBe(1);
    expect(ico.readUInt16LE(4), "entry count").toBeGreaterThan(0);
  });
});
