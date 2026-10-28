import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { metadataForPath, PUBLIC_METADATA } from "../src/seo";

function escape(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function routeHtml(root: string, viteEnv: Record<string, string>): Plugin {
  return {
    name: "public-route-html",
    configurePreviewServer(server) {
      // Preview the same route files used by Vercel and combined Express hosts.
      server.middlewares.use((req, res, next) => {
        const route = new URL(req.url ?? "/", "http://preview.local").pathname.replace(/\/+$/, "") || "/";
        if (Object.hasOwn(PUBLIC_METADATA, route) && route !== "/") req.url = `${route}/index.html`;
        else if (/^\/(chat|share|search|history|library|gpts|settings|admin|forgot-password|reset-password|verify-email)(\/|$)/.test(route)) {
          res.setHeader("X-Robots-Tag", "noindex, nofollow"); req.url = "/private.html";
        } else if (route !== "/" && req.headers.accept?.includes("text/html") && !fs.existsSync(path.resolve(server.config.root, server.config.build.outDir, route.slice(1)))) {
          res.statusCode = 404; req.url = "/404.html";
        }
        next();
      });
    },
    async writeBundle(options) {
      const dir = options.dir ?? path.join(root, "dist");
      const shell = fs.readFileSync(path.join(dir, "index.html"), "utf8");
      const server = await createServer({ root, configFile: false, plugins: [react()],
        resolve: { alias: { "@": path.join(root, "src"), "@Ken/shared": path.resolve(root, "../shared/src/index.ts") } },
        server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
      try {
        const { renderPublicPage } = await server.ssrLoadModule("/src/prerender.tsx") as { renderPublicPage(path: string): string };
        const landing = /^(true|1)$/i.test(viteEnv.VITE_SHOW_LANDING_PAGE ?? "");
        if (!landing) {
          const sitemapFile = path.join(dir, "sitemap.xml");
          fs.writeFileSync(sitemapFile, fs.readFileSync(sitemapFile, "utf8")
            .replace(/<url>\s*<loc>https:\/\/ken-ai\.tech\/<\/loc>[\s\S]*?<\/url>/, ""));
        }
        const paths = [...Object.keys(PUBLIC_METADATA), "/private", "/not-found"];
        for (const route of paths) {
          const meta = metadataForPath(route);
          if (route === "/" && !landing) meta.robots = "noindex, nofollow";
          let html = shell.replace(/<title>[\s\S]*?<\/title>/, `<title>${escape(meta.title)}</title>`);
          for (const [attribute, value] of Object.entries({ description: meta.description, robots: meta.robots,
            "og:title": meta.title, "og:description": meta.description, "og:url": meta.canonical,
            "twitter:title": meta.title, "twitter:description": meta.description })) {
            html = html.replace(new RegExp(`(<meta\\s+(?:name|property)="${attribute}"\\s+content=")[^"]*("\\s*\\/?>)`), `$1${escape(value)}$2`);
          }
          html = html.replace(/(<link rel="canonical" href=")[^"]*("\s*\/?>)/, `$1${escape(meta.canonical)}$2`);
          if (route !== "/" || !landing) html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, "");
          // The homepage fallback must never be copied into another route.
          html = html.replace(/<noscript>\s*<main[\s\S]*?<\/main>\s*<\/noscript>/, "");
          const body = route === "/" && !landing ? "" : renderPublicPage(route);
          html = html.replace('<div id="root"></div>', `<div id="root">${body}</div>`);
          if (route === "/" && landing) {
            for (const asset of fs.readdirSync(path.join(dir, "assets"))) {
              if (/^HomePage-.*\.css$/.test(asset)) html = html.replace("</head>", `<link rel="stylesheet" href="/assets/${asset}" /></head>`);
            }
          }
          html = html.replace("</head>", '<noscript><style>#boot-loader{display:none}</style></noscript></head>');
          const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
            .filter(match => !/\bsrc=/.test(match[1] ?? ""))
            .map(match => `'sha256-${createHash("sha256").update(match[2] ?? "").digest("base64")}'`);
          const connect = new Set(["'self'"]);
          for (const raw of [viteEnv.VITE_API_BASE_URL, viteEnv.VITE_API_URL, viteEnv.VITE_SENTRY_DSN]) {
            if (raw) { const url = new URL(raw); if (!/^https?:$/.test(url.protocol)) throw new Error("CSP endpoint must use HTTP(S)"); connect.add(url.origin); }
          }
          const policy = [`default-src 'self'`, `base-uri 'none'`, `object-src 'none'`,
            `script-src 'self' https://cdnjs.cloudflare.com ${hashes.join(" ")}`, `script-src-attr 'none'`,
            `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`, `font-src 'self' https://fonts.gstatic.com`,
            `img-src 'self' data: blob: https:`, `media-src 'self' blob:`, `connect-src ${[...connect].join(" ")}`,
            `frame-src 'self'`, `worker-src 'self' blob:`, `form-action 'self'`].join("; ");
          // Meta policy protects static hosts and is calculated from final HTML.
          html = html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" /><meta http-equiv="Content-Security-Policy" content="${escape(policy)}" />`);
          const output = route === "/" ? "index.html" : route === "/private" ? "private.html" : route === "/not-found" ? "404.html" : `${route.slice(1)}/index.html`;
          fs.mkdirSync(path.dirname(path.join(dir, output)), { recursive: true });
          fs.writeFileSync(path.join(dir, output), html);
        }
      } finally { await server.close(); }
    },
  };
}
