# Special project audit — 12 October 2026

Implementation started after this read-only audit. See [FIXES.md](FIXES.md) for the current source changes, verification results, and deployment requirements. The findings and original evidence below describe the pre-fix snapshot.

The project passes its existing checks, but the additional review found **27 actionable findings**, including four high-priority application issues involving browser account isolation, document decompression, and deletion of stored files. Dependency alerts are tracked separately within finding 13; their published severity does not establish an exploitable application vulnerability.

This is an audit and repair plan. Application source, dependencies, deployment configuration, and user uploads were not changed. Existing working-tree changes were preserved. New files in this directory contain the report and audit evidence.

## Scope and limits

Reviewed the current working tree: React/Vite client, Express/MongoDB server, shared validation, Cloudflare Worker, storage, authentication, chat/context handling, analysis runner, dependency locks, CI, public SEO configuration, and landing-page accessibility/performance. The repository already contained substantial uncommitted UI changes. Results describe that working tree, not just HEAD.

Read-only public requests sampled `https://ken-ai.tech/`, `/privacy`, `/share/audit-nonexistent`, `/robots.txt`, and `/sitemap.xml`. Those deployed responses may differ from local source; sampled HTML reported a 4 October Last-Modified date. No authenticated production session, production database, real user files, paid inference, object-storage mutation, load test, or deployment was used.

An audit cannot establish that every possible bug has been found. Live provider reliability, actual billing, infrastructure configuration, migration behavior against production data, Search Console coverage, and field Core Web Vitals remain outside the evidence collected here.

## Skills installed

Installed official `openai/skills` packages:

- `security-best-practices`
- `security-threat-model`
- `playwright`

They are under `C:/Users/arsla/.codex/skills/`. Restart Codex for normal automatic discovery. This audit directly read and used the security review and Playwright instructions. The threat-model package is installed for future threat-model work; this report is not a separately validated formal threat model.

The pasted names “SEO Core AI,” “Website SEO Auditor,” “WebPerf Auditor,” “CyberSecurity Auditor,” and “Code Secure” describe GPT Store assistants, not verified installable packages in the Codex skill catalog. I did not install or impersonate those assistants. Codex skills use a `SKILL.md` package format; SEO checks here use the project and official Google documentation. See [OpenAI skill documentation](https://developers.openai.com/plugins/build/skills).

## Verification results

| Check | Result | Evidence |
|---|---|---|
| Root typecheck | Pass | `.tmp/special-audit-2026-10-12/typecheck.log` |
| Root lint | Pass; one existing Fast Refresh warning at `client/src/components/ChatImage.tsx:209` | `lint.log` in the same directory |
| Shared unit tests | 32 passed, 3 files | `tests.log` |
| Server tests | 723 passed, 101 files | `tests.log` |
| Client tests | 310 passed, 59 files | `tests.log` |
| Root production build | Pass | `build.log` |
| Worker typecheck | Pass | `worker-typecheck.log` |
| Worker tests | 48 passed, 1 file | `worker-tests-clean.log` |
| Existing responsive suite | 72 passed: 320×568 and 1280×720; zero reported layout/setup failures | `responsive.log`; `client/playwright-report/responsive-audit/results.md` |
| Additional local browser scan | 6 routes × 2 widths; no horizontal overflow or missing image alt attributes in the sampled pages | [browser-pages.json](browser-pages.json) |
| Browser account-switch probe | B retained A's cached conversation list and new-chat draft | [browser-account-isolation.json](browser-account-isolation.json) |
| Offline service probes | All assertions passed, demonstrating the defects described below | [reproduce.mts](reproduce.mts); `reproduce.log` |
| Dependency audits | Root: 14 affected package records; Worker: 4 | [dependency-audit.json](dependency-audit.json) |

The root suites total **1,065 tests**; Worker tests bring the unit/integration total to **1,113**, plus 72 responsive cases. Passing responsive cases establish the checks implemented by that suite, not full accessibility or real-backend correctness. Browser API responses were fake and intercepted. The account-switch probe invoked the actual AuthProvider callbacks through development React context inspection; it was not a production login test.

Worker tests initially passed with a sandbox-denied Wrangler log write; a second run outside that restriction also passed. A broad browser mock initially intercepted Vite source-module URLs; that scan was discarded and repeated using only paths beginning `/api/`. The saved browser JSON comes from the corrected run.

The bounded, offline service reproductions are historical evidence for the audited working tree:

```powershell
node --import tsx docs/audits/2026-10-12/reproduce.mts
```

That script asserts pre-fix behavior and is not a health check for the repaired tree. Use the regression tests listed in FIXES.md instead. The historical script uses fake credentials/responses and stubbed model methods, never connects to MongoDB, and never calls a real provider. It proves the observed code behavior, not production exploitability. The decompression fixture expands to only 2 MiB.

## Priority index

| ID | Severity / scope | Finding |
|---|---|---|
| 01 | High, browser privacy | Private caches and drafts survive account changes |
| 02 | High, authenticated availability | Document expansion is unbounded before clipping |
| 03 | High, storage integrity | Object DELETE errors are treated as success |
| 04 | High, privacy/retention | Account deletion discards retry information for failed object purges |
| 05 | Medium, authorization | Admin privileges follow a stale token role |
| 06 | Medium, session integrity | Refresh rotation is not atomic |
| 07 | Medium, optional S3 | Default S3 URL and signed Host disagree |
| 08 | Medium, storage migration | Recorded file provider is ignored on reads/deletes |
| 09 | Medium, chat reliability | Latest message bypasses the input-token budget |
| 10 | Medium, optional analysis | External jobs never advance beyond queued |
| 11 | Medium, data access | History/search and Library silently stop at 40 records |
| 12 | Medium, optional hosting | Express SPA directory resolves to the wrong location |
| 13 | High-priority maintenance, conditional reachability | Vulnerable dependency versions remain installed |
| 14 | Medium, deployed SEO | robots.txt blocks rendering assets |
| 15 | Medium, deployed SEO | Route HTML initially publishes homepage metadata and index policy |
| 16 | Low, local SEO | Home title is overwritten with only the brand |
| 17 | Medium, defense in depth | CSP is absent; landing script lacks integrity protection |
| 18 | Medium, accessibility/performance | Reduced-motion preference leaves continuous canvas/WebGL animation running |
| 19 | Medium, accessibility | Landing skip link has no target |
| 20 | Low, UX/content | Footer destinations are missing or misleading |
| 21 | Medium, build reliability | Direct runtime/type imports rely on transitive dependencies |
| 22 | Medium, verification | CI omits the independently packaged Worker and browser suite |
| 23 | Medium, conditional Worker availability | Body limits apply after buffering |
| 24 | Low, upload correctness | Image validation accepts extension-only matches |
| 25 | Low, storage performance | Metadata GET downloads the whole object |
| 26 | Medium, platform cost | Spend ceiling has no reservation and fails open on Redis reads |
| 27 | Medium, administrative integrity | Concurrent deletions can remove the last two admins |

## Detailed findings and repair instructions

### 01 — Private caches and drafts survive account changes

**Evidence:** `client/src/main.tsx:15` creates one QueryClient for the application lifetime. `client/src/contexts/AuthProvider.tsx:41` changes only auth storage/state; logout at line 121 and unauthorized handling at line 84 do not clear protected data. `client/src/query.ts:61`, `client/src/pages/SearchPage.tsx:16`, and `client/src/pages/LibraryPage.tsx:46` use query keys without user identity. `client/src/stores/draftStore.ts:3` persists `Ken.drafts`, and `draftKey()` uses the shared `new` key. `client/src/utils/chatImageCache.ts:80` exposes a reset helper that auth transitions do not call.

**Impact and reproduction:** In one browser tab, the fake A session loaded `PRIVATE ACCOUNT A` and wrote `PRIVATE DRAFT A`; after actual logout/login callbacks changed the session to B, both remained. This can show another account's private conversation titles, cached content, or drafts on a shared browser. Server ownership checks still apply to new requests; this is a client-side confidentiality bug, not proof of a server IDOR.

1. Include authenticated user ID in every private query key, or recreate the protected QueryClient when the identity changes.
2. Cancel outstanding private requests before clearing caches. Ensure responses started under A cannot repopulate B's cache after a switch.
3. Namespace drafts by user; clear or intentionally retain them only inside that user's namespace. Clear private image blobs and other account-scoped stores on logout, unauthorized events, and account changes.
4. Add a browser regression that loads A's conversations, messages, files, preferences, and draft; delays an A response; switches to B without reloading; and checks that no A data is rendered or reused.

**Acceptance:** B sees only B data immediately, after delayed responses settle, and after a reload. A's draft never appears in B's composer.

### 02 — Document expansion is unbounded before clipping

**Evidence:** `server/src/services/storage/extractDocument.ts:99`, `:102`, `:202`, and `:205` call synchronous zlib decompression without an output limit. Text is clipped only afterward (`MAX_EXTRACT_CHARS`, line 4). The offline DOCX probe accepted 2,132 compressed bytes that expanded to 2,097,199 bytes before text clipping. Chat attachment materialization reaches the extractor through `server/src/services/storage/fileService.ts`.

**Impact:** An authenticated user able to upload and process documents can cause disproportionate memory allocation and event-loop blocking. A compressed upload-size cap does not cap expanded data. The bounded probe demonstrates expansion; no exhaustion attack was run.

1. Apply `maxOutputLength` to every inflate operation and enforce a cumulative expanded-byte budget across archive entries/PDF streams. Reject suspicious declared sizes, excessive entry counts, and expansion ratios before parsing.
2. Make the limit exception propagate as a clear validation error rather than silently trying an unlimited fallback.
3. Move expensive document parsing to an isolated worker with a time budget and concurrency cap; asynchronous zlib alone does not bound total allocation.
4. Test just-under/over limits, multiple individually small entries whose total exceeds the cap, malformed archives, and legitimate PDFs/DOCX files.

**Acceptance:** Oversized expansion fails predictably within a measured memory/time budget without blocking unrelated requests. [Node zlib options](https://nodejs.org/api/zlib.html#class-options) document the output-limit mechanism.

### 03 — Object DELETE errors are treated as success

**Evidence:** `server/src/services/storage/S3CompatibleStorage.ts:49` awaits a DELETE request but never checks the response. The offline probe returned HTTP 403 and `delete()` resolved successfully. `server/src/services/storage/fileService.ts:110` then deletes attachment/file metadata; account deletion also increments its success count.

**Impact:** A denied or failed object deletion can be reported as successful while bytes remain in S3/R2 and the normal application reference is lost. Trigger requires object storage and a failed DELETE response; local-disk behavior is separate.

1. Treat successful DELETE responses, and only explicitly supported already-missing responses, as success. Throw on authorization, throttling, and server failures.
2. Add a bounded request timeout and log a sanitized provider error code.
3. Preserve the row or durable deletion task until object removal is acknowledged; retry transient failures idempotently.
4. Test 204, already missing, 403, 429, 500, and a network timeout. Assert that failed deletion never removes the only retry reference.

**Acceptance:** The UI/API cannot claim completed removal following a rejected storage request.

### 04 — Account deletion discards retry information for failed object purges

**Evidence:** `server/src/services/auth/accountDeletionService.ts:140` calls a best-effort purge, then lines 144–148 delete owned collections and the user even when `storageObjectsFailed > 0`. `purgeStoredObjects()` at line 165 logs failures but creates no durable retry job. It selects only `storageKey`, also omitting the recorded provider (finding 08).

**Impact:** A temporary storage outage can leave user uploads behind after account removal. Logs do not constitute a reliable deletion queue. This is separate from finding 03: even correctly thrown storage failures are deliberately swallowed here. No production retention breach was tested or inferred.

1. Before removing file/account records, persist minimal deletion tombstones containing provider, key, status, attempt count, and expiry policy. Avoid retaining unnecessary personal data.
2. Disable the account/session immediately, then process object deletion with retry/backoff and an operator-visible failed state.
3. Make the returned/UI status distinguish completed account access removal from still-pending upload cleanup.
4. Test storage outages, process restarts mid-purge, repeated requests, and partial successes; confirm retries survive deletion of the user row.

**Acceptance:** Every failed object removal remains discoverable and retryable until confirmed deleted or explicitly resolved under an operator policy.

### 05 — Admin privileges follow a stale token role

**Evidence:** `server/src/middleware/requireAuth.ts:19` assigns `req.auth.role` from the JWT while fetching the current user separately. `requireAdmin()` at line 38 checks that token-derived role. The offline probe used an admin token with a current `role=user` record and passed the admin middleware.

**Impact:** Demoting an administrator without revoking their active sessions leaves admin access until token expiry. An attacker cannot become an admin merely by editing a signed token. The precondition is a legitimate role change with an active session.

1. Authorize sensitive actions using the current database role already fetched by requireAuth, or compare a current authorization-version field with the token.
2. Revoke sessions/increment the authorization version when roles change.
3. Test promotion, demotion, deleted users, and active old tokens against every admin route.

**Acceptance:** A demoted account loses administrator access on its next request.

### 06 — Refresh rotation is not atomic

**Evidence:** `server/src/services/auth/authService.ts:215–224` performs active-session lookup, revocation, and new issuance separately. A stubbed concurrent reproduction let two requests read the same active refresh token and both issue a new session.

**Impact:** A refresh token intended for one-time rotation can have two successors under concurrency/replay. This is not unauthenticated login bypass; possession of a valid refresh token is required. Database-level race behavior should also be exercised in integration tests.

1. Atomically consume an unrevoked token using a conditional find-and-update operation, so only one request wins.
2. Define token-family reuse handling and a deliberate policy for legitimate concurrent refreshes. Coordinate refreshes across browser tabs if needed.
3. Test parallel refreshes against a real test MongoDB; verify only the chosen policy's valid successor remains and old tokens cannot be reused.

**Acceptance:** Two simultaneous refreshes cannot independently rotate the same active token into two unrelated valid sessions.

### 07 — Default S3 URL and signed Host disagree

**Evidence:** `server/src/services/storage/S3CompatibleStorage.ts:82`, `:117`, `:125`, and `:132` sign `bucket.s3.region.amazonaws.com` but request `https://s3.region.amazonaws.com/bucket/key` when no endpoint is supplied. The probe asserts the URL host differs from the signed Host.

**Impact:** The default AWS path mixes virtual-host and path-style addressing, risking routing/signature failures. An explicit correctly configured R2/S3 endpoint takes a different branch and is not disproven by this probe. No real AWS request was made.

1. Construct one URL first, then derive canonical URI and Host from that same URL; consistently choose virtual-hosted or path-style addressing.
2. Validate the AWS region explicitly; reserve `auto` for providers that support it.
3. Prefer a maintained SDK/signing implementation, or add fixed signing vectors covering spaces, Unicode, nested keys, endpoint ports, and both addressing modes.
4. Verify upload/read/delete against a disposable bucket before switching production traffic.

**Acceptance:** The transmitted URL, Host header, and canonical signed request describe the same object endpoint.

### 08 — Recorded file provider is ignored on reads/deletes

**Evidence:** Upload records store `storageProvider` (`server/src/services/storage/fileService.ts:73`), but reads/deletes at lines 105–112 and materialization use the singleton from `server/src/services/storage/index.ts:81`. The offline probe reads a row marked `s3` through the current local provider. Account deletion similarly omits provider information.

**Impact:** Changing `STORAGE_PROVIDER` can make existing uploads unreadable or send deletion attempts to the wrong backend. This is a migration/configuration defect, not a demonstrated cross-user access bypass.

1. Resolve a configured backend from each file row's recorded provider; retain old backend configuration until migration completes.
2. Carry provider identity through document extraction, downloads, cleanup jobs, and generated-file paths.
3. If backend switching is unsupported, reject it explicitly while old-provider rows remain and document the migration procedure.
4. Test a mixed local/S3/R2 dataset across reads, chat attachments, file deletion, and account deletion.

**Acceptance:** Old and new files remain accessible and deletable during a supported provider migration.

### 09 — Latest message bypasses the input-token budget

**Evidence:** `server/src/services/chat/ContextManager.ts:117` rejects over-budget messages only when `kept.length > 0`. Its empty-result clamp cannot handle the first oversized message because that message was already added. The probe admitted about 30,004 estimated tokens into a Groq budget of 6,000. Shared validation allows up to 1,000,000 content characters (`shared/src/constants/index.ts:258`).

**Impact:** Long prompts/documents can trigger upstream context/quota failures and unnecessary cost despite the intended guardrail. Token estimation is approximate; the reproduced gap is much larger than approximation error.

1. Apply the budget to the newest message too, with an explicit reject/truncate/summarize policy that preserves the user's intent.
2. Budget system messages and attachment parts together before dispatch; reserve enough output space.
3. Recheck after provider fallback because budgets differ. Use provider-aware token counting where practical.
4. Test one huge user message, huge systems, document suffixes, image parts, small model windows, and fallback providers.

**Acceptance:** Every emitted context satisfies the chosen estimated budget, or returns a clear pre-dispatch size error.

### 10 — External analysis jobs never advance beyond queued

**Evidence:** `server/src/services/analysis/ExternalAnalysisRunner.ts:26` posts a job but ignores a successful response body. `get()` at line 77 reads only an in-memory Map; there is no upstream polling/callback integration or persistence. The probe returned a completed result from the runner and received `queued` without output.

**Impact:** When the external runner feature is enabled, successful jobs cannot reach usable completion through this adapter; restart also loses job history. The default unconfigured/disabled feature need not be affected.

1. Define and validate a runner response contract with upstream job ID, terminal status, output/artifacts, and safe errors.
2. Implement authenticated polling or verified callbacks, ownership checks, cancellation, and bounded request/job timeouts.
3. Persist job state with retention limits instead of an unbounded process Map.
4. Test immediate completion, queued→running→completed, failure, timeout, restart, wrong owner, and malformed runner output.

**Acceptance:** A submitted job can reach a visible terminal state and return its allowed output after a server restart.

### 11 — History/search and Library silently stop at 40 records

**Evidence:** `server/src/services/chat/conversationService.ts:54` defaults to 40 results with no conversation cursor. `client/src/services/api/chat.ts:5` requests no pagination, and `client/src/pages/SearchPage.tsx:21` searches only the loaded titles. `server/src/services/storage/fileService.ts:83` defaults to 40 files; `server/src/controllers/fileController.ts:40` exposes no pagination option. The offline probe confirms the Library query cap. Message-thread pagination already exists and should be retained.

**Impact:** Older chats/files appear missing; searching cannot find titles outside the first page. Archived search is also not included by the current default request. The records are not thereby deleted.

1. Add stable cursor-based pagination for conversation and file lists, with deterministic ID tie-breakers and a documented pinned-order policy.
2. Implement server-side title search with user ownership and an explicit archived scope; do not filter only a first page.
3. Connect pagination/load-more to sidebar, History, and Library and show loading/end/error states.
4. Test at least 101 records, equal timestamps, pinned entries, archived entries, and a match on the final page.

**Acceptance:** Every owned record is reachable without knowing its ID, and search covers its advertised scope.

### 12 — Express SPA directory resolves to the wrong location

**Evidence:** `server/src/middleware/clientSpa.ts:9` resolves `../../client/dist` from `server/dist/middleware`, yielding `server/client/dist`; the build emits root `client/dist`. The probe verifies this path arithmetic.

**Impact:** A combined Express deployment fails to detect/serve the built frontend. Separate Vercel frontend plus API hosting can work and is not invalidated by this finding.

1. Resolve the repository client artifact from the compiled layout, or accept a validated explicit client-dist path.
2. Test using compiled server output in production mode, not a source import.
3. Verify index and assets, a supported deep route, API exclusion, and unknown-route behavior in the documented hosting mode.

**Acceptance:** Building both projects enables the intended combined-host frontend; API-only hosting remains deliberate.

### 13 — Vulnerable dependency versions remain installed

**Evidence:** Registry audits and lockfiles are summarized in [dependency-audit.json](dependency-audit.json). Root results contain 14 affected package records: 5 critical, 2 high, 3 moderate, 4 low. Worker results contain 4 high records associated with the sharp chain. These include parent/meta-vulnerability records and are **not 18 independent exploitable application bugs**.

| Installed component | Alert and relevant boundary | Repair target / caution |
|---|---|---|
| `proxy-addr` 2.0.7 | Critical subnet-trust advisory; application currently uses numeric `trust proxy = 1`, so the specific vulnerable subnet configuration was not established | Patch to ≥2.0.8 and verify proxy topology/IP handling. [Maintainer advisory](https://github.com/jshttp/proxy-addr/security/advisories/GHSA-jqcg-44mw-7w3h) |
| `tinypool` 1.1.1 through Vitest 3.2.7 | Critical prototype-pollution gadgets require additional attacker influence/prototype pollution; test tooling, not proven server RCE | Use compatible patched test stack; advisory ranges require tinypool ≥2.1.2. [Maintainer advisory](https://github.com/tinylibs/tinypool/security/advisories/GHSA-85c8-ppgw-ccpr) |
| `shell-quote` 1.9.0 through concurrently | Critical quote/comment-token command injection; current fixed dev command strings do not prove attacker control | Update to ≥1.11.0 through compatible tooling |
| Vitest / `@vitest/mocker` | Moderate redirect-mock file-read advisory; relevant to exposed development/test infrastructure | Patched Vitest/mocker ≥4.1.11, subject to migration validation |
| `@modelcontextprotocol/sdk` 1.30.0 | High OAuth authorization-server credential issue; optional Multi-Agents tooling | ≥1.31.0 and review any untrusted MCP OAuth usage |
| `source-map-js` 1.2.1 | High indexed-source-map DoS; malicious sourcemap processing must be reachable | ≥1.2.2 |
| `fast-copy` 4.0.4, `hono` 4.13.5 | Moderate deep-copy exhaustion / boundary escaping; reachability not demonstrated in public app routes | ≥4.1.0 / ≥4.13.7 through compatible parents |
| Nested KaTeX 0.16.47 | Low trust-bypass condition involving existing prototype pollution; direct KaTeX 0.18.4 is already patched | Patch nested math dependencies too (≥0.18.2); validate integration compatibility |
| Worker `sharp` 0.35.4 through Wrangler/Miniflare | High librsvg advisory; local tooling image processing, not proof of deployed Worker exposure | ≥0.35.5 via compatible Cloudflare tooling. [Advisory](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |

1. Separate production runtime dependencies from development/optional tooling; patch both according to exposure, starting with internet-reachable runtime paths and developer services exposed to other users.
2. Upgrade compatible parent packages in small groups and regenerate both root and Worker lockfiles. Use narrow overrides only after confirming API compatibility.
3. Do **not** run `npm audit fix --force` blindly: the captured recommendations include a Vitest major upgrade and proposed math-package version changes/downgrades that need review.
4. Run a clean install, root checks/build, Worker checks, math rendering/copy tests, and browser smoke tests; repeat both audits and record remaining exceptions with expiry dates.

**Acceptance:** Applicable alerts are patched or have documented reachability assessments and a time-bound mitigation. Do not report the numeric audit score as demonstrated exploitability.

### 14 — robots.txt blocks rendering assets

**Evidence:** `client/public/robots.txt` and the sampled deployed `/robots.txt` contain `Disallow: /assets/`. Vite emits application JavaScript/CSS under that path.

**Impact:** A compliant crawler may not fetch resources needed to render this JavaScript application. This is a confirmed configuration issue; no specific ranking loss was measured. Google advises allowing the resources required for rendering in its [JavaScript SEO guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

1. Remove the blanket assets disallow; leave hashed assets cacheable.
2. Verify Googlebot can fetch representative built JS/CSS URLs and that public pages render in URL Inspection.
3. Review sitemap entries against the actual public route policy; private app routes should not be promoted in the sitemap.

**Acceptance:** Crawlers can load public-page rendering resources; sitemap and robots responses remain real text/XML, not SPA HTML.

### 15 — Route HTML initially publishes homepage metadata and index policy

**Evidence:** `client/index.html:19–34` supplies one title, root canonical, and `index, follow`; `vercel.json` rewrites public/private/share routes to that same HTML. Read-only live `/privacy` and `/share/audit-nonexistent` responses contained homepage metadata. The share sample had neither an initial noindex directive nor X-Robots-Tag. `client/src/hooks/useDocumentTitle.ts:79–111` updates canonical/robots only after JavaScript. The local browser confirmed that privacy metadata does improve after rendering.

**Impact:** Non-rendering preview crawlers receive incorrect titles/canonical/social metadata. A disallowed share URL can still appear as a URL in search if discovered externally; robots disallow prevents crawling rather than reliably enforcing noindex. This does **not** establish that private message content was exposed. See [Google robots.txt guidance](https://developers.google.com/search/docs/crawling-indexing/robots/intro).

1. Define route policy: public marketing/legal pages get their own initial title, description, canonical and social tags; workspace/token/share routes get the intended index policy at the HTTP/initial HTML level.
2. Prerender public routes or generate route-specific HTML. Apply X-Robots-Tag/noindex appropriately on non-indexable routes; do not rely on canonical-to-home as a substitute.
3. Account for the fact that robots-disallowed pages may not be crawled to observe noindex; use a deliberate crawl/index strategy while keeping actual private data behind authorization.
4. Verify raw HTML with JavaScript disabled, rendered DOM, social previews, sitemap, and Search Console. Preserve real HTTP 404s for unknown production routes.

**Acceptance:** Fetching each route directly returns correct metadata/index directives before client execution.

### 16 — Home title is overwritten with only the brand

**Evidence:** `client/src/hooks/useDocumentTitle.ts:60` returns `APP_NAME` when the home page has no page title; line 109 writes it to the document. Both local viewport scans changed the descriptive static title to `Ken AI`. The landing H1 text also combines visual wordmark layers as `Ken AIKENAI` in DOM text.

1. Give the home route a deliberate descriptive title and align static/prerendered/rendered versions.
2. Mark duplicated decorative wordmark text as hidden from assistive technology and provide one understandable heading.
3. Test title stability across navigation and the accessibility tree.

**Acceptance:** Rendering does not erase the meaningful home title, and the heading has a clear accessible name. Title length is an editorial target, not a rigid Google ranking rule.

### 17 — CSP is absent; landing script lacks integrity protection

**Evidence:** `server/src/app.ts:24` disables Helmet CSP. `vercel.json` has no CSP, and sampled frontend responses had none. `client/src/pages/landing/useLandingScenes.ts:1338` dynamically loads Three.js from cdnjs without an integrity attribute. Existing nosniff, frame denial, referrer policy, and deployed HSTS were observed and are positive controls.

**Impact:** Defense in depth against script injection and a compromised third-party script is weaker. No successful XSS or CDN compromise was found; absence of CSP alone is not an exploit.

1. Prefer bundling/self-hosting the reviewed Three.js dependency, or pin and verify a matching SRI hash with the required cross-origin mode.
2. Inventory scripts/styles/connect/media sources and inline boot/JSON-LD code. Deploy a tested CSP in report-only mode, then enforce using nonces/hashes where needed.
3. Apply the frontend policy at Vercel/edge; changing Express headers alone does not cover a separately hosted frontend.
4. Verify auth, provider requests, streaming, images, fonts, error reporting, and landing fallbacks under the policy.

**Acceptance:** Required functionality works under an enforced documented policy without broad script wildcards/unsafe exceptions introduced merely to silence errors.

### 18 — Reduced motion leaves continuous animation running

**Evidence:** `client/src/pages/landing/useLandingScenes.ts:81` samples reduced motion once. Line 753 slows one particle effect to 25%; robot/ring/feature animations at lines 1082–1100 and 1274–1279 continue. The shared loop at line 31 always schedules another frame until unmount. Existing teardown/visibility optimizations are useful, but do not constitute a full reduced-motion mode.

**Impact:** Users requesting reduced motion still receive continuous decorative movement, and avoidable work remains on low-power devices. This is code-based evidence, not a complete WCAG certification or measured field battery regression.

1. Render static scenes and stop nonessential canvas/WebGL frame loops when reduced motion is requested.
2. Subscribe to preference changes; preserve essential interaction feedback without continuous decorative animation.
3. Offer pause control if continuous movement remains, and retain offscreen/hidden-tab pausing.
4. Test reduced motion before load and toggled while mounted; measure frame activity on a throttled mobile profile.

**Acceptance:** The reduced-motion state produces a stable, usable page without ongoing decorative frame updates.

### 19 — Landing skip link has no target

**Evidence:** `client/src/layouts/AppShell.tsx:12` links to `#main-content`; `client/src/pages/HomePage.tsx` does not provide it. Corrected scans at both widths report this missing anchor. Workspace/auth/legal routes do provide their own targets, so the defect is specifically the landing composition.

1. Put `id="main-content"` and a suitable focus target on the landing main region.
2. Verify keyboard activation actually moves focus past repeated navigation, rather than only changing the URL fragment.
3. Add a landing keyboard smoke check; the existing isolated AppShell test supplies its own main and therefore misses this composition bug.

**Acceptance:** The first skip link moves keyboard focus to the landing main content at both tested viewport sizes.

### 20 — Footer destinations are missing or misleading

**Evidence:** `client/src/pages/HomePage.tsx:1064` links Security to nonexistent `#security`; scans confirm it. Social links at lines 1072–1087 all point to `#hero`; Blog and Careers point to unrelated sections at lines 1036 and 1047.

1. Replace each placeholder with its actual page/account destination, or remove/label it until available.
2. Link Security to a real security section/policy instead of a missing fragment.
3. Check all internal fragments, external destinations, and keyboard-accessible names on the built landing page.

**Acceptance:** Every visible footer promise takes users to matching content and no internal anchor points to a missing ID.

### 21 — Direct imports rely on transitive dependencies

**Evidence:** `client/src/utils/rehypeMathBlock.ts:1–2` imports `unist-util-visit` and `hast` types. `client/package.json` declares neither `unist-util-visit` nor `@types/hast`. Current installation succeeds through hoisted/transitive packages.

1. Declare `unist-util-visit` as a client runtime dependency and the appropriate `@types/hast` package as a client development dependency; `hast` is the type module name, not necessarily the npm package to install.
2. Regenerate the lockfile and validate a clean install with client typecheck/build and math copy/render behavior.

**Acceptance:** Direct client imports have explicit package declarations and no longer depend on another dependency accidentally supplying them.

### 22 — CI omits independently packaged Worker and browser checks

**Evidence:** `.github/workflows/ci.yml` runs root typecheck/lint/test/build. Root `package.json` excludes `worker` from workspaces and those scripts explicitly target only shared/server/client. The responsive script is also not invoked by CI. Worker tests passed manually in this audit, but that protection is absent from the routine gate.

1. Add a Worker job using its own lockfile: clean install, typecheck, and tests with fake bindings/no paid provider calls.
2. Add a small deterministic browser smoke job, including account isolation, keyboard skip-link behavior, and representative mobile routes; run the wider responsive suite on the chosen PR/nightly schedule.
3. Preserve artifacts on failure and keep fixture-only checks clearly distinguished from backend integration tests.
4. If retaining Multi-Agents, decide whether its independent verify/typecheck is part of the maintained toolchain too.

**Acceptance:** A deliberate Worker type error or browser smoke failure blocks the appropriate PR check.

### 23 — Worker body limits apply after buffering

**Evidence:** `worker/src/index.ts:150–154` checks declared Content-Length, then calls `request.text()` before checking actual bytes. The image route at lines 502–503 reads the entire ArrayBuffer before its size check. A missing Content-Length bypasses the early check.

**Impact:** Oversized authenticated requests can consume memory before being rejected. Worker authentication is present; this is a defense against misuse/compromise of the trusted caller or key, not evidence of an unauthenticated public attack. Cloudflare platform limits still apply but do not implement the application's smaller budget.

1. Read the request stream through a byte-counting bounded reader and cancel immediately when the route budget is exceeded.
2. Reuse it for JSON and binary routes, retaining separate intended limits for native document requests.
3. Test absent, understated, and accurate Content-Length, split chunks, cancellation, and exact boundary sizes.

**Acceptance:** Rejection occurs before buffering the full oversized body. Follow the current [Cloudflare Workers documentation](https://developers.cloudflare.com/workers/) when implementing runtime-specific readers.

### 24 — Image validation accepts extension-only matches

**Evidence:** `server/src/services/storage/validateUpload.ts:59` and `:68` use `sniffMime()`, whose extension fallback at line 93 onward is also used as the purported magic check. The probe passed plain non-image bytes named `.png` as an image.

**Impact:** Unsupported/malformed files can be stored and dispatched as images, causing broken rendering or provider errors. This does not by itself prove executable content or XSS; existing MIME restrictions/nosniff matter.

1. Separate signature detection from extension/MIME hints; require real signatures for binary formats and decode/validate within safe resource limits.
2. Keep explicit handling for text formats, which have no universal binary magic.
3. Test arbitrary bytes with allowed names, misleading declared types, truncated real images, and valid supported uploads.

**Acceptance:** A non-image byte sequence cannot pass as PNG merely because its filename ends in `.png`.

### 25 — Metadata GET downloads the whole object

**Evidence:** `server/src/controllers/fileController.ts:45` calls `readOwnedFile()` then returns only metadata. That helper at `server/src/services/storage/fileService.ts:105` fetches the full stored object into a Buffer.

**Impact:** Metadata requests unnecessarily consume disk/object-store I/O, memory, latency, and potentially egress. Ownership enforcement is present; this is a performance defect.

1. Read and serialize the owned database record for metadata-only routes.
2. Reserve object reads for content/model processing and use streaming where practical.
3. Verify metadata retrieval performs no storage get call, including for a large file and a temporarily unavailable storage backend.

**Acceptance:** File metadata remains available without downloading file content.

### 26 — Spend ceiling has no reservation and fails open on Redis reads

**Evidence:** `server/src/services/ai/spendCeiling.ts:28–37` returns zero after a Redis read error. Lines 41–53 check only usage already recorded; `recordSpend()` at line 67 adds tokens after completion. Dispatch calls the check in `server/src/services/ai/AIProviderManager.ts:527`; usage accounting happens later in `server/src/services/chat/usageService.ts:65`.

**Impact:** Concurrent generations can all start below the ceiling and overshoot it. Even a single allowed request can exceed the remaining allowance. Redis outages permit requests despite previous usage, and process-local totals are not shared across instances. User-owned provider keys are deliberately exempt. The configured ceiling is a soft post-accounting guard, not a reliable hard spending cap; no real billing overshoot was induced.

1. Decide and document whether this is a soft threshold or a hard platform-key budget.
2. For a hard cap, atomically reserve a bounded estimated input/output amount before dispatch, reconcile actual usage afterward, and expire abandoned reservations.
3. Choose an explicit outage policy: fail closed for shared paid keys or apply a small conservative emergency allowance; alert operators rather than silently treating usage as zero.
4. Test concurrent requests, multi-instance workers, Redis failures, retries, cancellations, and usage arriving after midnight.

**Acceptance:** The implementation matches the advertised budget policy and cannot repeatedly reset effective usage on a Redis read failure.

### 27 — Concurrent deletions can remove the last two admins

**Evidence:** `server/src/services/auth/accountDeletionService.ts:128–136` counts administrators and refuses deletion when there is only one, but no atomic guard connects the count to deletion at line 148.

**Impact:** With exactly two administrators, concurrent authorized deletion requests can both observe a count of two and leave none. This is an inferred race from separate database operations, not an executed production deletion or unauthenticated attack. Separate request transactions alone need not prevent this write-skew condition.

1. Serialize administrator membership changes through a shared guard document/lock or another database invariant that makes competing operations conflict.
2. Apply the same invariant to demotion and deletion and define an audited recovery path.
3. Run a real database concurrency test with two admins deleting/demoting simultaneously; exactly one operation should be allowed to remove admin status.

**Acceptance:** Supported administrative actions cannot leave the deployment without an administrator unless an explicitly designed operator recovery workflow is being used.

## Recommended implementation order

1. **Privacy and availability:** 01–04. Add focused regressions for account transitions, expanded-document budgets, and durable storage cleanup before changing behavior.
2. **Authorization and storage correctness:** 05–08 and 27. Confirm supported storage/hosting topology and migrate old file rows deliberately.
3. **Chat and feature reliability:** 09–12, 24–26. Make oversized prompts and unsupported analysis jobs fail clearly while full support is repaired.
4. **Dependency maintenance:** 13 and 21. Use a separate dependency change with clean-install validation, not a forced automatic rewrite mixed into feature fixes.
5. **Public SEO and accessibility:** 14–20. Allow render assets, generate correct initial metadata, fix keyboard navigation/links, then refine content and motion.
6. **Prevent recurrence:** 22–23 and the targeted tests above. Run existing suites plus regressions once each relevant change is complete, then verify the actual deployment in its configured mode.

## SEO and performance plan beyond the defects

| Page category | Intended treatment to confirm with the product owner |
|---|---|
| Homepage and real public feature/product pages | Indexable, meaningful initial HTML, distinct title/description, self-canonical, relevant internal links |
| Privacy/terms | Accurate route metadata and canonical; index policy chosen deliberately |
| Login/register | Decide whether indexing adds value; currently indexable by design |
| Chat/settings/library/admin and token flows | Authentication where required; noindex at initial response level; excluded from public sitemap |
| Public-by-link shares | Noindex if the privacy promise is “share by link”; access token remains the actual access mechanism, robots is not authorization |
| Missing routes/shares | Appropriate error UI and deliberate HTTP status, never fabricated public content |

The pasted SEO advice is useful as a starting checklist, but “exactly one H1,” “under 60 title characters,” “under 155 description characters,” and adding keywords to every alt attribute are not universal pass/fail rules. Write clear headings and useful metadata; describe meaningful images, and use empty alt text for purely decorative images. Avoid keyword stuffing. A sitemap and HTTPS already exist in the sampled deployment.

The build produces separate math/highlight/markdown chunks and uses lazy loading; this audit did not establish that those libraries all load on the homepage. Largest reported compressed JS chunks were React ~101.82 kB, math ~80.40 kB, highlight ~52.99 kB, and markdown ~50.68 kB. These are artifact sizes, not a Core Web Vitals score. Do not remove useful math rendering solely to shrink the largest file.

After the confirmed repairs, measure the production homepage and representative chat route on mobile: request waterfall, LCP, INP, CLS, long tasks, WebGL/canvas frame activity, cold API latency, and image transfer size. Prefer field data and repeatable lab measurements; no PageSpeed/Lighthouse score was obtained in this audit. Verify public marketing claims about SDKs, model names, pricing, and links against actual released capabilities before publishing them; the repository alone cannot establish whether an external SDK exists.

## Assessment of the earlier Claude cleanup report

The earlier report is a reasonably cautious **cleanup proposal**, not a comprehensive correctness/security audit. Its core distinction between app runtime, developer tools, historical documentation, and real uploads is useful. This review confirmed ThemeToggle has no external source reference, client direct imports depend on undeclared `unist-util-visit`/HAST types, and the named client packages have no direct source imports in the inspected tree. An unused direct dependency can still be a deliberate version pin/override; check the lock graph and clean build before removal.

`zz-shots.config.ts` was absent in the current working tree, so its reported creation time and original purpose cannot be independently verified here. Filesystem modification time would not establish who created it anyway. Historical reports and reproduction scripts being unnecessary at runtime does not establish that they have no maintenance value. In particular, the new probes demonstrate that external-analysis completion and per-file storage-provider handling still have defects; do not assume old repro coverage means every old issue is fixed.

Treat removal of Multi-Agents as a product/tooling decision, updating workspace entries, scripts and the lockfile together if chosen. Leave real `uploads/` intact. No cleanup deletions were performed as part of this audit.

## Controls observed and remaining checks

Useful existing controls include authenticated ownership queries for files, session-active checks, signed tokens, password hashing, upload byte caps, public/private route separation, Worker key checks, fixed vendor destinations, streaming support, lazy frontend chunks, and a broad existing test suite. React Markdown use alone is not evidence of XSS; constant markup assembly is not evidence of attacker-controlled HTML. No confirmed server-side cross-user file access, arbitrary runner code execution in the application process, or production credential disclosure was established.

Follow-up environment checks should cover trusted proxy hop counts and direct-origin access, Redis outage behavior for auth/chat limits, backup restore/deletion policy, shared-key rotation, per-user storage quotas, public-share request costs/rate limits, fresh authentication for destructive Google-only account actions, and actual provider/deployment smoke tests. These are review tasks rather than additional confirmed vulnerabilities in this report.

Raw logs and public-response captures remain in the ignored `.tmp/special-audit-2026-10-12/` directory. Portable evidence is included alongside this report. No commits, application repairs, production writes, or deployment changes were made.

Portable supporting artifacts: [verification summary](verification.json), [public response metadata](public-response-summary.json), and [account-switch Playwright probe](browser-account-probe.js). The latter is a Playwright CLI `run-code` body for a fresh isolated development browser, not a new application test or production login script.
