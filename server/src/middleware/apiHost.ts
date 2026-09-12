import type { Express, NextFunction, Request, Response } from "express";
import { API_PREFIX } from "@Ken/shared";

/**
 * Makes the API host presentable to a crawler, and invisible to a search index.
 *
 * On Render the server runs without `client/dist`, so `mountClientSpa` mounts
 * nothing and `GET /` fell through to the 404 handler. That is harmless to a
 * human — nobody types an API host into a browser — but Search Console is
 * configured here as a *domain* property (`sc-domain:ken-ai.tech`), which covers
 * every subdomain. Google crawled `https://api.ken-ai.tech/`, got a 404, and
 * reported the domain as having a Not found (404) indexing error.
 *
 * Two things fix it, and both are needed:
 *
 *   - `GET /` answers 200 with a short service descriptor, so the URL is no
 *     longer an error at all.
 *   - Every response carries `X-Robots-Tag: noindex`, so answering 200 does not
 *     trade a 404 error for an indexed API root competing with the real site.
 *
 * `robots.txt` deliberately allows `/` while disallowing the API itself. A
 * blanket `Disallow: /` would stop Google fetching the root, which would also
 * stop it ever seeing the `noindex` header — the URL would linger in the report
 * as blocked rather than being cleanly dropped.
 *
 * Only mounted when this process is not also serving the client. A combined
 * deployment must not send `noindex` for the website itself.
 */
export function mountApiHost(app: Express): void {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    next();
  });

  app.get("/robots.txt", (_req: Request, res: Response) => {
    res.type("text/plain").send(
      [
        "# Ken AI API. The website is https://ken-ai.tech",
        "# The root is intentionally crawlable so the X-Robots-Tag: noindex",
        "# header on it can be seen; nothing here belongs in a search index.",
        "User-agent: *",
        `Disallow: ${API_PREFIX}/`,
        "",
      ].join("\n"),
    );
  });

  app.get("/", (_req: Request, res: Response) => {
    res.status(200).json({
      service: "Ken AI API",
      status: "ok",
      website: "https://ken-ai.tech",
      health: `${API_PREFIX}/health`,
    });
  });
}
