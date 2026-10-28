# Audit fixes — 12 October 2026

Source changes address findings 01–27 from [REPORT.md](REPORT.md). They are local changes, not a deployment. Existing UI edits and earlier file removals were preserved. No production database, user uploads, provider keys, or cloud configuration was changed.

## Implementation

| Finding | Change |
|---|---|
| 01 | Account changes cancel private requests and queries, clear caches, remount page state, and select drafts by account. Legacy drafts without an owner are discarded. Late responses cannot restore the previous account's cache. |
| 02 | PDF/DOCX expansion is bounded to 4 MiB, with stream/entry limits. Binary parsing runs outside the HTTP event loop in at most two workers, with memory limits and a five-second deadline. Busy processing returns a retryable error. |
| 03 | Object DELETE checks HTTP status and propagates failures; requests have timeouts. Only acknowledged success or an explicit missing-object response counts as deletion. |
| 04 | Account deletion atomically saves object-cleanup jobs before removing ownership records. Leased background retries survive process restarts and storage outages. The UI distinguishes completed deletion from pending byte cleanup. |
| 05 | Admin authorization uses the current database role, so an old admin JWT cannot retain admin privileges after demotion. |
| 06 | Refresh tokens are consumed atomically. Concurrent refreshes produce exactly one successful rotation. |
| 07 | S3 signs the same host and path used by the actual request. AWS storage requires an explicit region; R2 retains its account endpoint. |
| 08 | Reads, model attachment processing, and deletes use each file's recorded provider. Missing historical-backend configuration fails explicitly instead of using the current upload store. |
| 09 | The newest message cannot bypass the context budget. Oversized prompts return `PROMPT_TOO_LARGE`; system and summary trimming includes framing overhead. |
| 10 | External analysis jobs persist in MongoDB, poll the runner, retain bounded output, enforce owner access, and expire. Terminal results cannot regress on concurrent polls. File IDs are checked for ownership before forwarding. |
| 11 | Conversation and file APIs provide stable cursors, with ID tie-breakers. History supports owner-scoped title search and archived scope. Existing client list consumers follow all pages rather than stopping at 40. |
| 12 | Combined Express hosting resolves root `client/dist`, selects the correct route HTML, excludes API routes, and returns 404 for unknown frontend routes. |
| 13 | Compatible dependency updates and narrow overrides remove the captured alerts. Vitest tests/types were migrated to version 4; both lockfiles were updated. |
| 14 | Rendering assets remain crawlable. Robots allows crawlers to observe private/share/token route `noindex`; authorization still controls data access. |
| 15 | Builds generate public-route metadata and actual initial landing/legal HTML. Private/share/token routes use a separate noindex shell; Vercel and Express select it before JavaScript. Non-home routes omit homepage JSON-LD. A hidden landing page is omitted from the generated sitemap. |
| 16 | The descriptive home title survives rendering and navigation. The existing heading already labels its decorative wordmark correctly; browser checks found no need to change that accessibility name. |
| 17 | Built HTML enforces a CSP using hashes for inline scripts and configured API/Sentry origins. Three.js has verified SRI and anonymous cross-origin mode. Code previews use a separate opaque sandbox so the main app can forbid inline scripts. |
| 18 | Reduced motion draws static canvas frames instead of scheduling continuous loops. Live preference changes tear down and rebuild scenes; switching back stops the loops again. |
| 19 | The landing skip link has a focusable `main-content` target. |
| 20 | Footer links point to real sections, privacy information, and the support email. Nonexistent blog, career, and social destinations were removed. |
| 21 | The client explicitly declares `unist-util-visit` and `@types/hast`. |
| 22 | CI includes independent Worker typecheck/tests/dashboard builds and mobile/desktop browser checks with retained reports. |
| 23 | Worker JSON and binary request readers enforce limits while reading chunks, cancel oversized streams, and reject before inference. |
| 24 | Binary upload types require matching signatures rather than filename fallback. This is signature validation, not a full image-format decoder. |
| 25 | File metadata GET reads the owned database record without fetching object bytes. |
| 26 | MongoDB atomically reserves estimated input plus capped output before shared-key dispatch, including retries and auxiliary calls. Known usage reconciles the reservation; unknown/aborted costs remain reserved. Accounting outages fail closed. BYOK is exempt. |
| 27 | A transaction updates a shared admin-membership guard before checking and deleting an admin. Concurrent deletion of the final two admins allows only one; ownership deletion and cleanup-job creation commit together. |

## Verification

Completed full run: **32 shared + 747 server + 316 client tests passed**, plus **50 Worker tests** and **72 responsive browser cases**. Additional tests introduced afterward cover isolated parser concurrency/expansion, metadata-only reads, combined-host routing, and analysis attachment ownership; the focused results are recorded below. Root typecheck, lint, production build, and Worker typecheck/dashboard build passed. Lint retains the existing Fast Refresh warning in `ChatImage.tsx`.

- Full run: `.tmp/special-audit-2026-10-12/fix-tests.log`.
- Focused parser/attachment checks: `fix-isolated-parser.log` (6 passed). The initial test deadline matched the worker deadline; tests now allow worker shutdown time without increasing the production parsing limit.
- Storage/routing/spending/analysis checks: `fix-final-regressions.log`.
- Final analysis/deletion checks: `fix-analysis-deletion-final.log` (17 passed); these also verify analysis attachment ownership.
- Browser results: [browser-fixes.json](browser-fixes.json) and [browser-account-motion-fixes.json](browser-account-motion-fixes.json). API responses were fake; no paid inference or real account was used.
- The browser account-switch check found no A data in B's cache or draft. Reduced motion recorded zero recurring frames, normal motion resumed, and switching back stopped it. No broken landing fragment links were found.
- Built browser checks confirmed correct initial privacy/terms metadata and content, private/share noindex shells, and working JavaScript previews without CSP violations in the sampled flows.
- Dependency audit: root and Worker report **zero advisories**. This is a registry result, not proof that the application has no vulnerabilities. No forced audit fix was used.
- Root lockfile/install-plan consistency passed `npm ci --dry-run --ignore-scripts --offline`; this does not claim a clean reinstall was performed.
- Worker lockfile/install-plan consistency passed the same offline dry run. Compiled production SPA checks passed for metadata, noindex, assets, API exclusion, robots/sitemap, and 404s (`fix-compiled-spa.log`).
- The compiled parser extracted a valid PDF, left the main event loop responsive, and rejected excess expansion without loading TypeScript (`fix-compiled-parser.log`). [implementation-verification.json](implementation-verification.json) records the run counts; focused suites overlap the full run and must not be added as unique totals.

## Deployment and configuration steps

1. **MongoDB:** Use Atlas or a replica set; account deletion now requires transactions. A standalone local MongoDB must be configured as a replica set before this operation can succeed. New models/indexes are registered at normal server startup. Pending cleanup jobs intentionally have no TTL; analysis jobs expire after seven days and daily spend counters within two days of their UTC usage date.
2. **Storage migration:** Keep the previous backend available while old files reference it. Current uploads still use `STORAGE_*`. Configure secondary S3/R2 credentials in server-only `STORAGE_BACKENDS_JSON`, for example:

   ```json
   {"r2":{"bucket":"old-bucket","accessKey":"SERVER_SECRET","secretKey":"SERVER_SECRET","region":"auto","endpoint":"https://ACCOUNT.r2.cloudflarestorage.com"}}
   ```

   For secondary S3 use a real AWS region. Preserve the original local volume for local-file rows. Changing buckets within the same provider still requires an explicit object migration: the existing schema records provider and key, not bucket history.
3. **Analysis service:** `ANALYSIS_RUNNER_URL` must point to an independently isolated, trusted service. POST `/jobs` receives `{id, language, code, fileIds?}` and must return JSON with `status` and optional `id`, `message`, and `output`. GET `/jobs/:id` returns the same status format. Accepted statuses are `queued`, `running`, `succeeded` (or `completed`), `failed`, and `rejected`. Output is limited to 65,536 characters; responses to 400 KB and ten seconds; jobs older than fifteen minutes fail. This patch supplies the application adapter, not a Python execution infrastructure. File IDs are references; the runner still needs a separately secured integration to resolve file content.
4. **Shared-key budget:** `AUTO_MODE_DAILY_TOKEN_CEILING=0` disables it. Otherwise every provider attempt reserves tokens in MongoDB. The input estimate includes headroom but is approximate, so this is an admission budget, not a hard currency/billing guarantee. Missing provider usage and failed attempts conservatively retain their reservation until the next UTC day. Existing historical usage is not backfilled into new counters; schedule rollout deliberately. The first day starts with the new counters.
5. **Frontend:** Build with the correct `VITE_API_BASE_URL` and optional `VITE_SENTRY_DSN`; those origins are used by CSP. Set `VITE_SHOW_LANDING_PAGE=true` when publishing the landing page. Preserve the existing default when it is intentionally hidden. Deploy all generated route HTML and the updated `vercel.json` together. The CSP is in built HTML so it also works on static hosts; `frame-ancestors` protection remains the existing X-Frame-Options header. Inline styles remain allowed because the UI and math renderer use them. Code previews permit local inline code only inside their opaque sandbox and block external scripts/requests.
6. **Release verification:** Include the existing responsive configuration and `client/e2e/responsive/` files when committing the CI changes; those files were already untracked work when this task started. Rebuild/redeploy the server, frontend, and Worker through the normal release process. The generated `worker/Ken-AI-Worker.js` is ready for the dashboard workflow. Verify real storage permissions, configured analysis service, deployment rewrites/headers, authenticated account flows, streaming/images/error reporting, and Search Console after deployment. No deployment was performed here.

The original report, dependency snapshot, and reproduction script remain historical evidence. The old script asserts bugs that these changes repair; use current regression tests for validation. General SEO/content strategy and production infrastructure checks remain separate from these source fixes.
