# KEN AI repository retention audit

Date: **5 October 2026, Asia/Karachi**. Scope: the complete local project and current Git index.

**Keep KEN's feature source, assets, contracts, regression tests, build/deployment configuration, and maintained operating instructions. Keep generated results, logs, credentials, caches, and user data out of Git. Review optional development automation separately.**

This audit created only this Markdown report. It did not change existing files, Git ignore rules, package files, tests, CI, application code, stored uploads, or deployments. No tests, builds, provider calls, or AI inference were run for this audit.

## What the audit establishes

The starting inventory contained **635 tracked files** and **182 untracked files eligible to be added to Git**. Of those eligible files, **172 are imported development skills under `.agents/`**. There are **173 tracked test specification files**: 68 client, 101 server, three shared, and one Worker. The two new responsive specification files are untracked and are additional to that count.

Tracked means present in the local Git index. It does not establish that the file has already been pushed to GitHub. Untracked means not yet in the index; ignored means excluded from normal additions by existing ignore rules. Git history and the remote GitHub repository were not inspected for historical copies or credentials.

All top-level entries, owned application/configuration/test files, documentation, tooling bundles, and generated-output locations were inventoried. Installed `node_modules/` trees and `.git/` internals were assessed as categories rather than auditing every third-party library or Git object. Storage payload contents were not opened, and secret values are not included in this report. This is a repository-retention audit, not a claim that a comprehensive secret or dependency-security scan has passed.

Recommendations mean:

| Decision | Meaning |
| --- | --- |
| **KEEP** | Retain in Git because it implements, verifies, builds, deploys, or explains KEN features. |
| **KEEP — optional tooling** | Useful shared development configuration; production does not need to load it. |
| **LOCAL ONLY / EXCLUDE** | Keep out of Git. This does not authorize deleting the local file or live data. |
| **REVIEW** | Preserve useful contracts, unresolved work, or dependent configuration before any later removal. |

## Every top-level folder

| Actual folder | Current Git state | Recommendation | Why retain it or exclude it |
| --- | --- | --- | --- |
| `.agents/` | 172 files, all untracked and **not ignored** | **LOCAL ONLY** by default | Imported assistant/design skill bundles, not KEN runtime features. They occupy about 4.08 MiB. A future broad `git add .` can add them unless a later ignore change excludes them. Share intentionally only if the team needs these tools. |
| `.claude/` | Exists but is empty | **No Git content to retain** | Git does not track empty directories. No Claude project rules, personal settings, or permission files were present. If shared KEN instructions are added later, assess those separately from machine-specific settings. |
| `.cursor/` | Ten tracked rule files | **KEEP — optional tooling** | These are KEN-specific development safeguards covering architecture, security, provider boundaries, testing, and design. They are useful team instructions, not generated reports. |
| `.github/` | One tracked CI workflow | **KEEP** | Runs installation, typecheck, lint, tests, and production build on main pushes and pull requests. Removing it removes automated release checks. |
| `.git/` | Local Git metadata | **Managed by Git; never add as project content** | Stores history/index/configuration for the checkout, not KEN source. Do not delete it as repository cleanup. |
| `client/` | 230 tracked files; five new responsive source files eligible; local outputs ignored | **KEEP source/config/assets/tests** | Implements the frontend: chat, model selection, image rendering, auth, library, GPTs, settings, admin pages, legal pages, and landing page. Exclude only its generated outputs and private environment files. |
| `server/` | 312 tracked files; generated files and local secrets ignored | **KEEP source/config/tests** | Implements Express API, authentication, MongoDB models, provider routing, quotas, uploads, image generation, memory, search, voice, sharing, export, and analysis contracts. One temporary probe is separately identified below. |
| `shared/` | 14 tracked files; build output ignored | **KEEP source/config/tests** | Shared DTOs, validation schemas, model catalog/constants, and reasoning utilities are dependencies of the app and Worker. |
| `worker/` | 18 tracked files; local Wrangler outputs ignored | **KEEP feature source and deployment inputs** | Provides the authenticated Cloudflare/provider proxy. Some generated files are currently deliberate deployment/typechecking inputs; see the exceptions below. |
| `docs/` | 22 tracked files and two eligible responsive docs | **KEEP maintained feature docs/tools; remove ordinary results from Git later** | Contains both useful API/deployment/flow documentation and dated reports/generated JSON. Do not delete the whole folder. All 24 current files are assessed below. |
| `Multi-Agents/` | 20 tracked files; six generated reports ignored | **REVIEW — optional developer workspace** | Claude SDK repository audit/fix orchestration, not the deployed chatbot or analysis runner. Keep if these development commands are wanted; otherwise remove through a coordinated later change. |
| `tests/` | One untracked file | **EXCLUDE current scaffold** | Its only file is `example.spec.ts`, which tests the Playwright website rather than KEN. This finding does not apply to KEN's real tests elsewhere. |
| `test-results/` | Ignored; one local metadata file | **LOCAL ONLY** | Generated Playwright run state. Actual spelling is lowercase `test-results/`, not `Test Results/`. |
| `playwright-report/` | Ignored; one generated HTML file | **LOCAL ONLY** | Disposable browser-test report, not feature source. |
| `uploads/` | Only `.gitkeep` tracked; 30 payload files ignored | **KEEP placeholder; EXCLUDE data** | User uploads and stored generated images are runtime data. The local folder contains about 10.82 MB. Deleting payloads can break existing attachments; exclusion from Git does not imply deletion. Actual spelling is lowercase `uploads/`. |
| `node_modules/` | Ignored at root and workspace levels | **LOCAL ONLY** | Installed third-party dependencies are recreated from manifests and lockfiles. Do not commit them. |

There is no project `.codex/` directory in the inspected checkout. No separate `Tests/`, `Test Results/`, or `Uploads/` directories were found with those spellings.

## Every top-level file

| File | Current state | Recommendation | Reason |
| --- | --- | --- | --- |
| `.gitignore` | Tracked, with a pre-existing local modification | **KEEP** | Controls actual Git exclusions for secrets, dependencies, builds, logs, tests, and uploads. This audit did not change it. |
| `.cursorignore` | Tracked | **KEEP — optional tooling; review later** | Controls Cursor context/indexing, not Git. Its broad `*.json` pattern can hide package manifests and JSON fixtures from editor assistance. Narrowing it is an optional future tooling change. |
| `package.json` | Tracked | **KEEP** | Workspaces, dependency declarations, build/start/test commands, and Node version. Root `test:responsive` deliberately selects the responsive config. |
| `package-lock.json` | Tracked | **KEEP** | Pins root/workspace installations. CI and deployment configuration use `npm ci`; excluding this lockfile would undermine that setup. |
| `README.md` | Tracked | **KEEP; maintain** | Entry point for feature architecture, setup, environments, and commands. Some opening/provider descriptions differ from the newer Worker setup; treat this as a documentation-maintenance item, not a reason to remove the README. |
| `render.yaml` | Tracked | **KEEP** | Express deployment build/start instructions, health route, public configuration, and secret variable names. Secrets are requested using `sync: false`, rather than stored as values here. |
| `vercel.json` | Tracked | **KEEP** | Frontend build/output, SPA route rewrites, caching and response headers. Removing it changes deployment behavior. |
| `playwright.responsive.config.ts` | Untracked, eligible | **KEEP and commit when ready** | Real KEN responsive infrastructure for all ten requested viewport sizes; referenced by `npm run test:responsive`. |
| `playwright.config.ts` | Untracked, eligible | **EXCLUDE current scaffold; coordinate later** | Targets root `tests/`, currently only Playwright demo tests. Real KEN E2E uses `client/playwright.config.ts`; responsive tests use their own config. Update any documentation references if this scaffold is removed later. |
| `audit-build.log` | Ignored | **LOCAL ONLY** | One-time compiler/build output; about 18.9 KB. Already covered by `*.log`. |
| `audit-lint.log` | Ignored | **LOCAL ONLY** | One-time lint output; about 1.1 KB. Already covered by `*.log`. |
| `audit-tests.log` | Ignored | **LOCAL ONLY** | One-time test output; about 58.4 KB. Keep test source rather than this output. Already covered by `*.log`. |

## Agent and editor folders in detail

### `.agents/`

| Bundle | Files | Git recommendation | What it actually contains |
| --- | ---: | --- | --- |
| `skills/banner-design/` | 2 | Local only | General banner instructions/references. |
| `skills/brand/` | 18 | Local only | Branding guidance, scripts, and references. |
| `skills/design/` | 35 | Local only | Logo/icon/design tools and datasets. |
| `skills/design-system/` | 27 | Local only | Generic token and presentation generators; these are not the application's own runtime design tokens. |
| `skills/slides/` | 6 | Local only | Presentation creation tools. |
| `skills/ui-styling/` | 16 | Local only | General UI skill resources; includes an Apache 2.0 license file. |
| `skills/ui-ux-pro-max/` | 68 | Local only | Design catalogs, Python searches, references, and skill tool tests. These datasets are not KEN model catalogs. |

No app/build imports from these skills, nested Git repositories, or skill-local caches/dependency directories were found. If intentionally vendoring a skill for the team, keep its required scripts/data/references together. Only one explicit license file was found across these bundles; this inspection does not establish redistribution permissions for every bundle. Imported generic skills can remain installed locally while the Git repository stays focused on KEN.

### `.cursor/`, `.claude/`, `.github/`

Keep all ten current `.cursor/rules/*.mdc` files: `ai-providers`, `architecture`, `backend-security`, `dependencies`, `frontend-boundaries`, `ken-design`, `no-fake-features`, `no-secrets`, `testing`, and `typescript`. They express project constraints and help prevent regressions. `Multi-Agents/src/project-context.ts` contains an inline copy of the house rules; it does not load the `.mdc` files during a mission.

`.claude/` currently has nothing to commit. Shared future project instructions can be useful; personal permission/session files should be treated separately. Keep `.github/workflows/ci.yml`: it is executable release infrastructure, not an ordinary report. The current CI does **not** explicitly run the new responsive Playwright suite, the Worker workspace checks, or the optional Multi-Agents checks; retaining the workflow is not evidence that those checks already run in CI.

## Feature folders that must remain

| Area | Retain | Why |
| --- | --- | --- |
| Frontend | `client/src/`, `client/index.html`, `client/public/`, package/Vite/TypeScript/ESLint config | Actual pages, components, hooks, API client, state, branding, SEO/PWA metadata, and build setup. |
| API | `server/src/config/`, `controllers/`, `middleware/`, `models/`, `routes/`, `services/`, `utils/`, `validators/`, `types/`, app/server entrypoints | Implements all KEN API features, persistence, security, and integrations. |
| Shared contracts | `shared/src/types/`, `schemas/`, `constants/`, `utils/`, `index.ts` and workspace config | The frontend, backend, and Worker depend on these contracts/catalogs. |
| Worker | `worker/src/index.ts`, `wrangler.jsonc`, package/lock/config files, dashboard builder and setup instructions | Defines the deployed provider proxy and its deployment workflow. |
| Operational scripts | `server/src/scripts/` | Reusable health, database/storage checks, catalog checks, benchmarking, and dummy-data maintenance. They are developer/operations source, not reports; some commands intentionally mutate data or call providers, so retaining them does not imply running them in this audit. |
| Upload feature | `server/src/services/storage/`, file routes/controller/models, client file/attachment modules, shared contracts, storage tests/runbooks | Keep the capability and validation/authentication. Keep actual uploaded payloads outside Git. |
| Analysis feature | `server/src/services/analysis/`, `server/src/routes/analysis.ts`, tools controller/manager, shared analysis contracts, `client/src/services/api/misc.ts` | Real analysis integration uses `ANALYSIS_RUNNER_URL`, independently of `Multi-Agents/`. |

The eight files in `client/public/` are all retained: `apple-touch-icon.png`, `favicon.ico`, `icon-192.png`, `icon-512.png`, `og-image.png`, `robots.txt`, `site.webmanifest`, and `sitemap.xml`. Product assets are different from generated test screenshots.

### Important generated-file exceptions

| File | Recommendation | Dependency evidence |
| --- | --- | --- |
| `worker/Ken-AI-Worker.js` | **KEEP for the current dashboard-paste workflow** | Generated by `worker/scripts/build-dashboard.mjs`; `worker/SETUP.md` and `docs/WORKER_RENDER_SETUP.md` instruct copying it into the Cloudflare editor. The source of truth is `worker/src/index.ts` plus shared constants. It could become a release artifact later if that workflow changes, but excluding it now would remove the ready-to-paste file the project uses. |
| `worker/worker-configuration.d.ts` | **KEEP under current TypeScript configuration** | Generated Wrangler runtime types, but explicitly referenced by `worker/tsconfig.json` and `worker/test/tsconfig.json`. Removing it without adding a reliable generation step can break typechecking. Size alone is not a reason to remove it. |
| `client/e2e/fixtures/landing-mobile-layout.json` | **KEEP** | A deliberate expected-layout baseline used by `landing-layout-compare.spec.ts`, not a disposable run report. |

Keep `worker/package-lock.json` in addition to the root lockfile: `worker/` is separately installed and is not listed among the root npm workspaces. Keep `worker/.editorconfig` and `.prettierrc` as small shared formatting conventions. `worker/.vscode/settings.json` only supplies an editor file association; it is optional shared tooling, not an application feature or secret. `worker/AGENTS.md` is optional Worker-development guidance worth retaining with the Worker.

Placeholder files under already populated source directories are optional: the existing `.gitkeep` files in `server/src/services/ai/`, its providers/normalizers, and `services/auth/` are harmless but not needed to retain populated directories. Placeholders in empty `services/files/` and `validators/` preserve a layout convention only. None are generated reports or priority cleanup targets. Retain `uploads/.gitkeep` as the explicit documented storage placeholder.

## Tests: source stays, output stays out

| Path or pattern | Decision | Reason |
| --- | --- | --- |
| `client/src/**/*.test.ts`, `**/*.test.tsx`, `client/src/test/setup.ts` | **KEEP** | Feature regressions for chat, model selection, images, auth, settings, and utilities. |
| `server/src/**/*.test.ts`, `server/src/test/` | **KEEP** | Auth/API/database/storage/provider/security/document/image regression coverage and harnesses. |
| `shared/src/**/*.test.ts` | **KEEP** | Contract/schema/catalog/reasoning coverage. |
| `worker/test/`, `worker/vitest.config.mts` | **KEEP** | Worker feature tests and mocked bindings. |
| `client/e2e/agents/` | **KEEP** | Nine genuine KEN browser suites. The word `agents` in the path does not make these disposable agent reports. |
| `client/e2e/helpers/`, `fixtures/`, `reporters/`, `client/playwright.config.ts` | **KEEP** | Reusable fixtures, mocks, expected layout, reporting code, and E2E configuration. Reporter source stays even though reporter output does not. |
| `client/e2e/responsive/` | **KEEP and commit** | Five source files: `audit.ts`, `detector.spec.ts`, `fixtures.ts`, `reporter.ts`, `responsive.spec.ts`. Implements the requested overflow/image-layout testing. |
| `server/src/services/auditRegressions.test.ts` and `.integration.test.ts` | **KEEP** | Executable feature regression protection despite the word `audit` in their names. |
| `tests/example.spec.ts` | **EXCLUDE current scaffold** | Only two example checks against `playwright.dev`; no KEN feature coverage. |
| `test-results/`, `client/test-results/` | **LOCAL ONLY** | Run metadata, failure attachments, screenshots, traces. Already ignored. |
| `playwright-report/`, `client/playwright-report/` | **LOCAL ONLY** | Generated HTML/JSON/Markdown findings and screenshots. Already ignored; client reports currently total about 16.86 MB. |
| `coverage/`, `.nyc_output/`, `blob-report/`, browser caches/auth-state outputs | **LOCAL ONLY** | Generated measurements/state rather than test source. Existing ignore rules cover the current output locations. |

Do not exclude every file matching `*.json`, `*.md`, `*.png`, `test`, or `audit`. That would also exclude feature manifests, maintained docs, KEN assets, meaningful tests, and the expected-layout baseline.

## Every current file in `docs/`

| File | Git state | Recommendation | Reason and condition for later cleanup |
| --- | --- | --- | --- |
| `API.md` | Tracked | **KEEP** | KEN HTTP API contract; linked from README. |
| `DEPLOYMENT.md` | Tracked | **KEEP** | Deployment topology, auth, DNS, storage and environment setup. |
| `REQUEST_ROUTING.md` | Tracked | **KEEP; review/update later** | Feature flow map. Some pinned-fallback, Flux-only image and Gateway descriptions are stale; preserve/update the contract rather than discard it. |
| `WORKER_RENDER_SETUP.md` | Tracked | **KEEP** | Worker/Render setup and environment ownership; linked from Worker setup. |
| `RESPONSIVE_TESTING.md` | Untracked | **KEEP and commit** | Maintained instructions for the actual responsive test infrastructure. |
| `AI_SYSTEM_FLOW_AND_READINESS_2026-10-03.md` | Tracked | **REVIEW / consolidate** | Mixed durable data flow/env ownership and dated readiness results. Keep durable content in a current architecture/runbook doc; retire dated results and update the README link together. |
| `CLOUDFLARE_AI_FLOW_AND_WORKER_API_RECOMMENDATIONS_2026-10-03.md` | Tracked | **REVIEW / consolidate, then archive the report** | Historical inspection/proposals plus useful Worker-contract explanations. Preserve applicable feature guidance in maintained docs. |
| `ALL_BUGS_AND_STEP_BY_STEP_FIXES.md` | Tracked | **REVIEW before exclusion** | Mixed audit history and unresolved implementation backlog. Transfer open work to issues/current checklist. Regression-test comments reference this file. |
| `AUDIT-2026-09-30.md` | Tracked | **EXCLUDE / archive outside normal source** | Dated report, not a feature dependency. Retain any still-open work in a maintained tracker first. |
| `BUG-AUDIT-AND-FIX-PLAN-2026-10-02.md` | Tracked | **EXCLUDE after backlog consolidation** | Historical report/plan. Preserve unresolved tasks before retiring it. |
| `DEPLOYMENT_CHECK_2026-10-03.md` | Tracked | **EXCLUDE / archive** | One-time verification results; explicitly marked superseded. |
| `PROJECT_REPORT.txt` | Tracked | **EXCLUDE / archive** | Narrative project history and ordinary report; not runtime behavior. |
| `RESPONSIVE_FINDINGS_2026-10-05.md` | Untracked | **LOCAL ONLY** | Dated test findings. Transfer the unresolved square-image layout defect to an issue; adjust the link in `RESPONSIVE_TESTING.md` if removing the report later. |
| `verify-worker-deployment.mts` | Tracked | **KEEP** | Reusable verification source for KEN deployment/providers; its generated JSON results should be excluded. Optional chat flags perform real inference. |
| `verify-local-models.mts` | Tracked | **KEEP** | Reusable model registry/adapter diagnosis source; output is disposable. Optional chat flag performs real inference. |
| `cloudflare-diagnose.mts` | Tracked | **KEEP** | Reusable routing/credential troubleshooting source. Optional `--chat` is a live provider operation. |
| `audit-routing-repro.mts` | Tracked | **REVIEW, then exclude/archive** | Demonstrates original defects rather than asserting desired corrected behavior. Move any uncovered cases into maintained regression tests before dropping it. |
| `audit-additional-repro.mjs` | Tracked | **REVIEW, then exclude/archive** | Historical defect demonstration with mocked dependencies. Same migration condition as above. |
| `apply-cloudflare-catalog.mjs` | Tracked | **EXCLUDE / archive** | One-off mutating migration helper; writes shared catalog/server/export source. Current structure already reflects that migration; it is not an ongoing feature operation. |
| `cloudflare-quota-check.json` | Tracked | **EXCLUDE** | Generated quota snapshot. |
| `local-model-check.json` | Tracked | **EXCLUDE** | Generated local model-check snapshot. |
| `provider-matrix-check.json` | Tracked | **EXCLUDE** | Generated live provider test matrix. |
| `worker-chat-check.json` | Tracked | **EXCLUDE** | Generated chat-check snapshot. |
| `worker-deployment-check.json` | Tracked | **EXCLUDE** | Generated deployment-check snapshot. |

`server/scripts/flux-probe.mjs` is another **EXCLUDE / archive** candidate outside docs. Its header calls it a one-shot probe and says to delete after use. It is not selected by an npm script or required by the app; it makes live image-generation probes when executed. Keep the actual Cloudflare image provider and its tests instead. This audit did not execute it.

This audit report, `REPOSITORY_RETENTION_AUDIT_2026-10-05.md`, is also an **ordinary dated report**. It is created for your review; it need not be committed if you want feature-focused Git history. A short maintained repository policy could be committed later instead.

## `Multi-Agents/`: optional, but remove it coherently if chosen

| Contents | Current state | Recommendation |
| --- | --- | --- |
| `src/`, `run-agents.ts` | Tracked developer orchestration source | Keep only while supporting repository audit/fix missions. |
| `package.json`, `tsconfig.json`, `eslint.config.js`, `README.md` | Tracked workspace setup/instructions | Keep with the optional workspace; exclude only as part of its coordinated removal. |
| `.env.example` | Tracked template | Keep with the workspace; use placeholders rather than real credentials. |
| `.gitignore` | Tracked | Keep with the workspace; already excludes its reports/logs. |
| `reports/` | Six ignored generated Markdown/JSON files | Local only; ordinary mission reports. |
| `logs/` | Empty, ignored output location | Local only. |

Root `package.json` lists `Multi-Agents` as a workspace and exposes `agents`, `agents:audit`, and `agents:verify`. Runtime frontend/backend/Worker source does not import it. Its runner sends repository-oriented missions to the Claude SDK. Removing only the directory would leave workspace/script/lockfile references inconsistent. A future approved removal must update root workspace membership, its scripts and relevant lockfile dependency records together. Root application CI currently does not validate this workspace.

Keep the server's analysis feature regardless of this decision. A folder named `Multi-Agents` is not the implementation of chat Auto mode, provider fallback, or the isolated analysis runner.

## Secrets, runtime data and generated outputs

| Category | Current evidence | Git policy |
| --- | --- | --- |
| Real environment files | Local `client/.env`, `server/.env`, `server/.dev-secrets.json` exist and are ignored | Never commit their real values. The audit checked path/status, not their values. |
| Environment templates | `client/.env.example`, `server/.env.example`, `Multi-Agents/.env.example`, `worker/.dev.vars.example` are tracked | Keep variable names and safe defaults/placeholders. Do not copy production keys into templates. |
| Worker local variables | `worker/.dev.vars*` excluded by Worker ignore rules; example intentionally tracked | Real secrets stay outside Git; keep template. |
| Private credentials/captures | Root ignore rules cover keys, credential/service-account JSON, local JSON and specified auth-response capture paths | Continue excluding these. An ignore rule is not a historical secret scan. |
| Build outputs | `client/dist/`, `server/dist/`, `shared/dist/` ignored | Rebuild for development/deployment; commit source/build configuration instead. Shared exports depend on built `dist`, which scripts generate first. |
| Compiler metadata | `shared/tsconfig.tsbuildinfo` ignored | Local-only incremental compiler state. |
| Worker state/build cache | `worker/.wrangler/` ignored | Local-only Wrangler state, dashboard dry-run bundle, maps and logs; keep the deliberate dashboard export exception described above. |
| User payloads | `uploads/*` ignored, `uploads/.gitkeep` retained | Store user/generated files in runtime storage, not Git. Preserve the storage implementation and deployment configuration. |
| Logs | `*.log`, `logs/` ignored | Local or external logging system; ordinary output does not belong in source control. |
| Dependency/OS/IDE caches | `node_modules/`, caches, OS metadata, most IDE state ignored | Local only. Shared small project conventions may be deliberately retained. |

No tracked `audit-*.log`, `*.tsbuildinfo`, `test-results/`, `playwright-report/`, or coverage output files were found. The main generated-output cleanup opportunity **inside Git** is the five tracked `docs/*-check.json` / matrix snapshots and dated documentation reports, not the ignored local test folders.

Adding a future ignore pattern alone will not stop tracking a file already in Git. Any later cleanup of tracked reports must remove them from tracking deliberately; excluding from Git and deleting local files are separate choices. This report has performed neither action.

## Proposed future cleanup order — not executed

1. Preserve all feature source, shared contracts, product assets, meaningful tests, lockfiles, deployment configuration, CI and current runbooks.
2. Commit the useful new responsive source/config and `RESPONSIVE_TESTING.md` when ready. Leave its dated findings and this audit report local.
3. Keep `.agents/` local by adding a narrowly scoped ignore rule in a later approved change, unless you intentionally want to share the skill bundles.
4. Retire tracked generated JSON snapshots and ordinary dated reports. First move unresolved defects to issues and durable architecture/env instructions into maintained docs; update links together.
5. Decide whether `Multi-Agents` developer commands are useful. Retain the whole workspace or remove the workspace/scripts/lockfile references coherently.
6. Exclude the root Playwright demo config/tests together, the one-shot Flux probe and completed catalog migration helper. Preserve actual E2E/responsive/regression coverage.
7. Keep runtime uploads intact. Ignored local logs/builds/test reports can be cleaned separately later if disk space is the goal.

## Evidence used

- Root [`package.json`](../package.json): workspace membership, feature build/test commands, optional agent commands and explicit responsive config.
- [`.gitignore`](../.gitignore), [`Multi-Agents/.gitignore`](../Multi-Agents/.gitignore), [`worker/.gitignore`](../worker/.gitignore): actual exclusions, confirmed with `git check-ignore` on representative paths.
- [CI workflow](../.github/workflows/ci.yml), [`render.yaml`](../render.yaml), [`vercel.json`](../vercel.json): release/deployment dependencies and generated build destinations.
- [`client/vite.config.ts`](../client/vite.config.ts), [`server/vitest.config.ts`](../server/vitest.config.ts), [`client/playwright.config.ts`](../client/playwright.config.ts), [`playwright.responsive.config.ts`](../playwright.responsive.config.ts): meaningful test discovery and output locations.
- [Worker dashboard builder](../worker/scripts/build-dashboard.mjs), [Worker setup](../worker/SETUP.md), [Worker TypeScript config](../worker/tsconfig.json): deliberate generated-file exceptions.
- [Layout baseline test](../client/e2e/agents/landing-layout-compare.spec.ts), [responsive reporter](../client/e2e/responsive/reporter.ts): baseline/report-source distinction.
- [Storage selection](../server/src/services/storage/index.ts), [local disk storage](../server/src/services/storage/LocalDiskStorage.ts), [analysis runner selection](../server/src/services/analysis/index.ts): runtime data and analysis-feature boundaries.
- [Agent project context](../Multi-Agents/src/project-context.ts), [agent runner](../Multi-Agents/src/runner.ts): optional developer orchestration.
- `git ls-files`, untracked-file enumeration, recursive owned-tree inventory and direct file/reference inspection. Findings describe the checkout at audit time; no remote or historical audit is implied.

## Complete owned-file recommendation index

The appendix below lists every starting tracked and eligible untracked file. Generated/ignored folders are covered above; dependency trees and Git internals are excluded from the owned-file index. Each file uses the policy explained above, so repeated source files do not need repeated prose. The report itself is excluded from the starting inventory.


### Tracked files: all 635 starting paths

Counts: EXCLUDE: 11, KEEP: 578, KEEP (optional): 6, KEEP (tooling): 15, REVIEW: 25.

<details>
<summary>Expand the complete tracked-file index</summary>

| Path | Recommendation | Reason |
| --- | --- | --- |
| `.cursor/rules/ai-providers.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/architecture.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/backend-security.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/dependencies.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/frontend-boundaries.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/ken-design.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/no-fake-features.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/no-secrets.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/testing.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursor/rules/typescript.mdc` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.cursorignore` | KEEP (tooling) | Shared KEN development guidance/editor context configuration. |
| `.github/workflows/ci.yml` | KEEP | Automated release checks. |
| `.gitignore` | KEEP | Source-control exclusions for local/generated/sensitive files. |
| `Multi-Agents/.env.example` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/.gitignore` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/README.md` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/eslint.config.js` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/package.json` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/run-agents.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/agents.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/cli.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/config.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/guards.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/logger.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/missions.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/orchestrator.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/planner.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/project-context.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/report.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/runner.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/types.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/src/verify.ts` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `Multi-Agents/tsconfig.json` | REVIEW | Optional developer workspace; preserve/remove references together. |
| `README.md` | KEEP | Project setup or maintained documentation. |
| `client/.env.example` | KEEP | Configuration template; retain names/placeholders, never real keys. |
| `client/e2e/agents/auth-responsive.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/agents/chat-interface-clutter.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/agents/chat-ux-polish.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/agents/composer-a11y.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/agents/desktop-regression.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/agents/landing-layout-compare.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/agents/landing-mobile-menu.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/agents/landing-story-graphics.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/agents/tablet-mobile-viewport.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/fixtures/landing-mobile-layout.json` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/e2e/helpers/chat.ts` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/e2e/helpers/demoAccount.ts` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/e2e/helpers/layout.ts` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/e2e/helpers/mockSession.ts` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/e2e/reporters/viewport-report.ts` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/eslint.config.js` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `client/index.html` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `client/package.json` | KEEP | Reproducible workspace dependencies and commands. |
| `client/playwright.config.ts` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `client/public/apple-touch-icon.png` | KEEP | KEN branding/SEO/PWA asset or metadata. |
| `client/public/favicon.ico` | KEEP | KEN branding/SEO/PWA asset or metadata. |
| `client/public/icon-192.png` | KEEP | KEN branding/SEO/PWA asset or metadata. |
| `client/public/icon-512.png` | KEEP | KEN branding/SEO/PWA asset or metadata. |
| `client/public/og-image.png` | KEEP | KEN branding/SEO/PWA asset or metadata. |
| `client/public/robots.txt` | KEEP | KEN branding/SEO/PWA asset or metadata. |
| `client/public/site.webmanifest` | KEEP | KEN branding/SEO/PWA asset or metadata. |
| `client/public/sitemap.xml` | KEEP | KEN branding/SEO/PWA asset or metadata. |
| `client/src/App.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/app.css` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/AddModelKeysDialog.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/AttachmentChips.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/AuthField.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/AuthModeNav.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/AutoModeIcon.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ChatComposer.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/ChatComposer.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ChatImage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/ChatImage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ChatTurn.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/ChatTurn.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/CodeBlock.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/CodeGenerationTicker.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/CodeGenerationTicker.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ComposerMentions.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ComposerToolbar.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ConversationItemMenu.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ConversationList.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ConversationSidebar.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/ConversationSidebar.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/DeferredMarkdown.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/DeferredMarkdown.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ErrorBoundary.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/ErrorBoundary.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/GoogleMark.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/GptForm.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/KenMark.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/LazyMarkdown.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/LiveVoiceOverlay.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/MarkdownContent.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/MarkdownContent.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/MathBlock.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/MessageAvatar.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ModelSelector.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/ModelSelector.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/OtpInput.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/OtpInput.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/PageFallback.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/RichContent.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/RichContent.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ShareExportMenu.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ShortcutsModal.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/ShortcutsModal.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/SidebarAccountMenu.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/SidebarNavLink.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ThemeToggle.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/ThinkingPipeline.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/ThinkingPipeline.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/Toaster.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/Toaster.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/components/UserMessageBubble.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/components/UserMessageBubble.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/contexts/AuthProvider.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/contexts/ThemeProvider.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/contexts/auth-context.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/hooks/useAuth.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/hooks/useChatAttachments.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/hooks/useChatStream.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/hooks/useChatThread.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/hooks/useChatVoice.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/hooks/useDocumentTitle.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/hooks/useDocumentTitle.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/hooks/useStickToBottom.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/hooks/useStreamBuffer.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/hooks/useStreamBuffer.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/index.css` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/layouts/AppShell.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/layouts/AppShell.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/layouts/AuthLayout.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/layouts/WorkspaceLayout.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/main.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/ChatPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/ChatPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/ForgotPasswordPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/GptCreatePage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/GptDetailPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/GptsPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/GptsPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/HomePage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/HomePage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/LegalPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/LibraryPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/LibraryPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/LoginPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/LoginPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/NotFoundPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/PrivacyPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/RegisterPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/RegisterPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/ResetPasswordPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/ResetPasswordPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/SearchPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/SearchPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/SharePage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/SharePage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/TermsPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/VerifyEmailPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/VerifyEmailPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/admin/AdminModelsPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/admin/AdminProvidersPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/admin/AdminUsagePage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/landing/faqs.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/landing/landing.css` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/landing/useLandingScenes.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsAccountPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/settings/SettingsAccountPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsAppearancePage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/settings/SettingsAppearancePage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsDataControlsPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsGeneralPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsMemoryPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/settings/SettingsMemoryPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsModelsPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/settings/SettingsModelsPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsNotificationsPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/settings/SettingsNotificationsPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsPersonalizationPage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/settings/SettingsPersonalizationPage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/pages/settings/SettingsVoicePage.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/pages/settings/SettingsVoicePage.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/query.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/query.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/routes/AdminRoute.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/routes/GuestRoute.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/routes/GuestRoute.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/routes/LandingRoute.test.tsx` | KEEP | Executable KEN feature regression tests. |
| `client/src/routes/LandingRoute.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/routes/ProtectedRoute.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/routes/index.tsx` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/seo.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/services/api.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/services/api/admin.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/auth.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/chat.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/client.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/errors.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/files.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/gpts.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/me.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/misc.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/models.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/tools.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/types.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/services/api/voice.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/stores/draftStore.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/stores/draftStore.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/stores/modelStore.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/stores/modelStore.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/stores/themeStore.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/stores/toastStore.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/stores/uiStore.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/test/setup.ts` | KEEP | Reusable KEN test harness or setup. |
| `client/src/types/three-global.d.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/apiBaseUrl.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/apiBaseUrl.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/apiErrors.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/apiErrors.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/attachmentGate.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/attachmentGate.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/authCache.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/authCache.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/authFieldTone.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/autoMode.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/autoMode.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/bootLoader.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/bootLoader.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/browserSpeech.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/chatImageCache.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/chatMessages.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/chatMessages.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/cn.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/cn.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/composerPaste.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/composerPaste.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/defaultModel.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/defaultModel.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/download.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/errorReporting.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/featureFlags.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/featureFlags.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/gptForm.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/groupConversations.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/groupConversations.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/keyboard.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/keyboard.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/latexNormalize.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/latexNormalize.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/markdownNeeds.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/markdownNeeds.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/mentions.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/mentions.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/parseRichContent.test.ts` | KEEP | Executable KEN feature regression tests. |
| `client/src/utils/parseRichContent.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/utils/rehypeMathBlock.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/src/vite-env.d.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `client/tsconfig.json` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `client/tsconfig.node.json` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `client/vite.config.ts` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `docs/AI_SYSTEM_FLOW_AND_READINESS_2026-10-03.md` | REVIEW | Preserve durable flow/env instructions, then retire dated readiness. |
| `docs/ALL_BUGS_AND_STEP_BY_STEP_FIXES.md` | REVIEW | Preserve unresolved backlog and update test-comment references. |
| `docs/API.md` | KEEP | Maintained feature/API/deployment/testing instructions. |
| `docs/AUDIT-2026-09-30.md` | EXCLUDE | Dated inspection; preserve open work in a tracker first. |
| `docs/BUG-AUDIT-AND-FIX-PLAN-2026-10-02.md` | EXCLUDE | Historical report; transfer unresolved tasks before retirement. |
| `docs/CLOUDFLARE_AI_FLOW_AND_WORKER_API_RECOMMENDATIONS_2026-10-03.md` | REVIEW | Consolidate durable Worker guidance out of historical inspection. |
| `docs/DEPLOYMENT.md` | KEEP | Maintained feature/API/deployment/testing instructions. |
| `docs/DEPLOYMENT_CHECK_2026-10-03.md` | EXCLUDE | Superseded one-time results. |
| `docs/PROJECT_REPORT.txt` | EXCLUDE | Ordinary narrative project report. |
| `docs/REQUEST_ROUTING.md` | KEEP | Feature routing map; revise stale descriptions later. |
| `docs/WORKER_RENDER_SETUP.md` | KEEP | Maintained feature/API/deployment/testing instructions. |
| `docs/apply-cloudflare-catalog.mjs` | EXCLUDE | Completed one-off source migration helper. |
| `docs/audit-additional-repro.mjs` | REVIEW | Move uncovered defect cases to maintained regression tests. |
| `docs/audit-routing-repro.mts` | REVIEW | Move uncovered defect cases to maintained regression tests. |
| `docs/cloudflare-diagnose.mts` | KEEP | Reusable feature/deployment diagnostic source; results excluded. |
| `docs/cloudflare-quota-check.json` | EXCLUDE | Generated quota snapshot. |
| `docs/local-model-check.json` | EXCLUDE | Generated model snapshot. |
| `docs/provider-matrix-check.json` | EXCLUDE | Generated live provider results. |
| `docs/verify-local-models.mts` | KEEP | Reusable feature/deployment diagnostic source; results excluded. |
| `docs/verify-worker-deployment.mts` | KEEP | Reusable feature/deployment diagnostic source; results excluded. |
| `docs/worker-chat-check.json` | EXCLUDE | Generated chat-check results. |
| `docs/worker-deployment-check.json` | EXCLUDE | Generated deployment-check results. |
| `package-lock.json` | KEEP | Reproducible workspace dependencies and commands. |
| `package.json` | KEEP | Reproducible workspace dependencies and commands. |
| `render.yaml` | KEEP | Deployment behavior/configuration. |
| `server/.env.example` | KEEP | Configuration template; retain names/placeholders, never real keys. |
| `server/eslint.config.js` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `server/package.json` | KEEP | Reproducible workspace dependencies and commands. |
| `server/scripts/flux-probe.mjs` | EXCLUDE | One-shot live image probe, not a feature dependency. |
| `server/src/app.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/config/cors.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/config/database.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/config/devSecrets.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/config/env.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/config/env.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/config/http.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/config/http.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/config/logger.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/config/redis.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/config/sentry.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/authController.oauth.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/controllers/authController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/chatController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/exportController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/fileController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/gptController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/healthController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/meController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/memoryController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/notificationController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/providerController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/shareController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/toolsController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/usageController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/controllers/voiceController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/middleware/apiHost.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/middleware/apiHost.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/middleware/clientSpa.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/middleware/errorHandler.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/middleware/errorHandler.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/middleware/hardening.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/middleware/notFound.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/middleware/rateLimit.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/middleware/rateLimit.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/middleware/requestId.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/middleware/requireAuth.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/middleware/requireAuth.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/middleware/sanitizeInput.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/middleware/sanitizeInput.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/AIModel.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/AIProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/Attachment.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/Conversation.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/CustomGPT.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/CustomInstruction.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/File.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/Memory.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/Message.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/Notification.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/PasswordReset.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/Session.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/SharedConversation.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/UsageRecord.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/User.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/UserProviderCredential.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/VerificationToken.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/applyJsonTransform.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/models/indexes.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/models/serialization.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/admin.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/analysis.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/auth.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/auth.routes.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/auth.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/auth.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/chat.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/chat.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/conversations.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/conversations.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/deleteAccount.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/files.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/files.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/gpts.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/health.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/health.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/me.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/memories.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/memories.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/models.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/not-found.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/notifications.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/notifications.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/providers.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/providers.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/settings.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/share.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/share.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/tools.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/routes/tools.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/routes/voice.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/scripts/bench-latency.ts` | KEEP | Reusable feature operations/maintenance source. |
| `server/src/scripts/checkCatalogDrift.ts` | KEEP | Reusable feature operations/maintenance source. |
| `server/src/scripts/checkStorage.ts` | KEEP | Reusable feature operations/maintenance source. |
| `server/src/scripts/clearDummyData.ts` | KEEP | Reusable feature operations/maintenance source. |
| `server/src/scripts/pingCloudflareModels.ts` | KEEP | Reusable feature operations/maintenance source. |
| `server/src/scripts/verify-health.ts` | KEEP | Reusable feature operations/maintenance source. |
| `server/src/scripts/verify-mongo.ts` | KEEP | Reusable feature operations/maintenance source. |
| `server/src/server.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/.gitkeep` | KEEP (optional) | Harmless source-directory convention; not runtime logic. |
| `server/src/services/ai/AIProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/AIProviderManager.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/AIProviderManager.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/ModelRegistry.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/ModelRegistry.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/aiGateway.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/attachmentRoute.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/attachmentRoute.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/bootstrap.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/catalog.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/catalog.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/createProviderAdapter.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/createProviderAdapter.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/credentialCache.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/credentialCache.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/credentials.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/encryption.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/encryption.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/endpointPolicy.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/fallback.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/fallback.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/fallbackController.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/fallbackController.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/gatewayUrl.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/keyPool.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/keyPool.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/modelSkip.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/modelSkip.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/nativeDocuments.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/normalizers/.gitkeep` | KEEP (optional) | Harmless source-directory convention; not runtime logic. |
| `server/src/services/ai/normalizers/normalize.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/normalizers/normalize.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/platformChatQuota.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/platformChatQuota.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/primaryModel.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/primaryModel.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providerService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providers/.gitkeep` | KEEP (optional) | Harmless source-directory convention; not runtime logic. |
| `server/src/services/ai/providers/CloudflareProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providers/GeminiProvider.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/providers/GeminiProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providers/MockProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providers/OpenAICompatibleProvider.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/providers/OpenAICompatibleProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providers/cloudflareModels.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/providers/cloudflareModels.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providers/compatibleChatBody.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/providers/compatibleChatBody.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providers/geminiNative.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/providers/geminiNative.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/providers/geminiReply.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/providers/geminiReply.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/spendCeiling.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/spendCeiling.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/streamStallGuard.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/streamStallGuard.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/ai/workerRouting.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/ai/workerRouting.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/analysis/AnalysisRunner.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/analysis/ExternalAnalysisRunner.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/analysis/UnconfiguredAnalysisRunner.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/analysis/analysisRunner.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/analysis/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auditRegressions.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/auditRegressions.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/auth/.gitkeep` | KEEP (optional) | Harmless source-directory convention; not runtime logic. |
| `server/src/services/auth/accountDeletionService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/authService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/clientOrigin.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/auth/config.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/cookies.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/auth/cookies.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/crypto.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/auth/crypto.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/duration.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/emailService.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/auth/emailService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/googleAuthService.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/auth/googleAuthService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/loginLockout.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/auth/loginLockout.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/sessionService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/toPublicUser.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/auth/tokens.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/ContextManager.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/ContextManager.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/answerProtocol.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/answerProtocol.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/atomicConversation.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/autoRoute.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/autoRoute.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/chatService.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/chatService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/chatTitle.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/chatTitle.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/codeGeneration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/codeGeneration.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/contextCompression.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/contextCompression.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/conversationService.feedback.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/conversationService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/conversationSummary.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/conversationSummary.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/documentContext.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/documentContext.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/documentParts.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/documentParts.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/documentSections.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/documentSections.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/generationEstimate.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/generationRegistry.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/generationRegistry.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/generationTypes.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/identity.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/identity.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/imageIntent.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/imageIntent.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/languageRule.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/languageRule.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/listMessages.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/loadHistory.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/neuronGuardrail.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/neuronGuardrail.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/prepareEdit.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/prepareGeneration.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/prepareHelpers.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/prepareRegenerate.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/prepareTurn.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/prepareTurn.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/promptOrder.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/responsePolicy.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/responsePolicy.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/runGeneration.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/streamTurn.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/toPublic.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/toPublic.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/chat/usageService.integration.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/chat/usageService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/export/exportService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/export/formatExport.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/export/formatExport.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/files/.gitkeep` | KEEP (optional) | Harmless source-directory convention; not runtime logic. |
| `server/src/services/gpts/gptService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/image/CloudflareImageProvider.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/image/CloudflareImageProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/image/GeminiImageProvider.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/image/GeminiImageProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/image/ImageGenerationProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/image/OpenAIImageProvider.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/image/OpenAIImageProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/image/UnconfiguredImageProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/image/failoverImageProvider.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/image/failoverImageProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/image/index.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/image/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/memory/instructionService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/memory/memoryService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/memory/persona.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/memory/persona.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/notifications/notificationService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/search/BraveSearchProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/search/SearchProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/search/SerperSearchProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/search/TavilySearchProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/search/UnconfiguredSearchProvider.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/search/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/search/searchProvider.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/share/shareService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/LocalDiskStorage.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/storage/LocalDiskStorage.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/S3CompatibleStorage.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/StorageService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/UnconfiguredStorage.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/documentIndex.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/extractDocument.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/storage/extractDocument.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/fileService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/storage/materializeFiles.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/storage/objectStorage.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/storage/validateUpload.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/storage/validateUpload.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/tools/ToolManager.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/services/tools/ToolManager.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/voice/OpenAIVoiceService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/voice/UnconfiguredVoiceService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/voice/VoiceService.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/services/voice/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/test/mongoHarness.ts` | KEEP | Reusable KEN test harness or setup. |
| `server/src/test/providerHarness.ts` | KEEP | Reusable KEN test harness or setup. |
| `server/src/test/registerVerified.ts` | KEEP | Reusable KEN test harness or setup. |
| `server/src/types/express.d.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/utils/AppError.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/utils/abort.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/utils/asyncHandler.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/utils/redact.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/utils/redact.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/utils/sse.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/utils/sse.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/utils/telemetry.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/utils/telemetry.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/src/validators/.gitkeep` | KEEP (optional) | Harmless source-directory convention; not runtime logic. |
| `server/src/validators/validate.test.ts` | KEEP | Executable KEN feature regression tests. |
| `server/src/validators/validate.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `server/tsconfig.json` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `server/vitest.config.ts` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `shared/eslint.config.js` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `shared/package.json` | KEEP | Reproducible workspace dependencies and commands. |
| `shared/src/constants/cloudflareModels.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `shared/src/constants/constants.test.ts` | KEEP | Executable KEN feature regression tests. |
| `shared/src/constants/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `shared/src/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `shared/src/schemas/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `shared/src/schemas/schemas.test.ts` | KEEP | Executable KEN feature regression tests. |
| `shared/src/types/domain.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `shared/src/types/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `shared/src/utils/reasoning.test.ts` | KEEP | Executable KEN feature regression tests. |
| `shared/src/utils/reasoning.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `shared/tsconfig.json` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `shared/vitest.config.ts` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `uploads/.gitkeep` | KEEP | Documented storage placeholder; payloads remain excluded. |
| `vercel.json` | KEEP | Deployment behavior/configuration. |
| `worker/.dev.vars.example` | KEEP | Configuration template; retain names/placeholders, never real keys. |
| `worker/.editorconfig` | KEEP (tooling) | Shared Worker development convention, not a runtime feature. |
| `worker/.gitignore` | KEEP | Source-control exclusions for local/generated/sensitive files. |
| `worker/.prettierrc` | KEEP (tooling) | Shared Worker development convention, not a runtime feature. |
| `worker/.vscode/settings.json` | KEEP (tooling) | Shared Worker development convention, not a runtime feature. |
| `worker/AGENTS.md` | KEEP (tooling) | Shared Worker development convention, not a runtime feature. |
| `worker/Ken-AI-Worker.js` | KEEP | Current ready-to-paste Worker deployment export. |
| `worker/SETUP.md` | KEEP | Project setup or maintained documentation. |
| `worker/package-lock.json` | KEEP | Reproducible workspace dependencies and commands. |
| `worker/package.json` | KEEP | Reproducible workspace dependencies and commands. |
| `worker/scripts/build-dashboard.mjs` | KEEP | Project setup or maintained documentation. |
| `worker/src/index.ts` | KEEP | KEN feature implementation, shared contract, or type declaration. |
| `worker/test/index.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `worker/test/tsconfig.json` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `worker/tsconfig.json` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `worker/vitest.config.mts` | KEEP | Project build/lint/typecheck/test/entrypoint configuration. |
| `worker/worker-configuration.d.ts` | KEEP | Generated runtime types explicitly required by current TS config. |
| `worker/wrangler.jsonc` | KEEP | Deployment behavior/configuration. |

</details>

### Eligible untracked files: all 182 starting paths

Counts: EXCLUDE: 3, KEEP: 7, LOCAL ONLY: 172.

Untracked files are not yet committed. Eligibility is not a recommendation to add them.

<details>
<summary>Expand the complete eligible-untracked-file index</summary>

| Path | Recommendation | Reason |
| --- | --- | --- |
| `.agents/skills/banner-design/SKILL.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/banner-design/references/banner-sizes-and-styles.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/SKILL.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/approval-checklist.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/asset-organization.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/brand-guideline-template.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/color-palette-management.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/consistency-checklist.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/logo-usage-rules.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/messaging-framework.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/typography-specifications.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/update.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/visual-identity.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/references/voice-framework.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/scripts/extract-colors.cjs` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/scripts/inject-brand-context.cjs` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/scripts/sync-brand-to-tokens.cjs` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/scripts/tests/test_sync_brand_to_tokens.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/scripts/validate-asset.cjs` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/brand/templates/brand-guidelines-starter.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/SKILL.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/data/slide-backgrounds.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/data/slide-charts.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/data/slide-color-logic.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/data/slide-copy.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/data/slide-layout-logic.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/data/slide-layouts.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/data/slide-strategies.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/data/slide-typography.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/references/component-specs.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/references/component-tokens.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/references/primitive-tokens.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/references/semantic-tokens.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/references/states-and-variants.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/references/tailwind-integration.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/references/token-architecture.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/embed-tokens.cjs` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/fetch-background.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/generate-slide.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/generate-tokens.cjs` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/html-token-validator.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/search-slides.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/slide-token-validator.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/slide_search_core.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/tests/test_validate_tokens.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/scripts/validate-tokens.cjs` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design-system/templates/design-tokens-starter.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/SKILL.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/data/cip/deliverables.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/data/cip/industries.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/data/cip/mockup-contexts.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/data/cip/styles.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/data/icon/styles.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/data/logo/colors.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/data/logo/industries.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/data/logo/styles.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/banner-sizes-and-styles.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/cip-deliverable-guide.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/cip-design.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/cip-prompt-engineering.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/cip-style-guide.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/design-routing.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/icon-design.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/logo-color-psychology.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/logo-design.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/logo-prompt-engineering.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/logo-style-guide.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/slides-copywriting-formulas.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/slides-create.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/slides-html-template.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/slides-layout-patterns.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/slides-strategies.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/slides.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/references/social-photos-design.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/scripts/cip/core.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/scripts/cip/generate.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/scripts/cip/render-html.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/scripts/cip/search.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/scripts/icon/generate.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/scripts/logo/core.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/scripts/logo/generate.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/design/scripts/logo/search.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/slides/SKILL.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/slides/references/copywriting-formulas.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/slides/references/create.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/slides/references/html-template.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/slides/references/layout-patterns.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/slides/references/slide-strategies.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/LICENSE.txt` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/SKILL.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/references/canvas-design-system.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/references/shadcn-accessibility.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/references/shadcn-components.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/references/shadcn-theming.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/references/tailwind-customization.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/references/tailwind-responsive.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/references/tailwind-utilities.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/scripts/requirements.txt` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/scripts/shadcn_add.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/scripts/tailwind_config_gen.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/scripts/tests/coverage-ui.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/scripts/tests/requirements.txt` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/scripts/tests/test_shadcn_add.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-styling/scripts/tests/test_tailwind_config_gen.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/SKILL.md` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/app-interface.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/catalog-summary.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/charts.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/colors.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/data-provenance.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/google-font-licenses.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/google-fonts.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/icons.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/landing.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/motion.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/phosphor-icons-upstream.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/products.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/react-performance.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/angular.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/astro.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/avalonia.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/flutter.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/html-tailwind.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/javafx.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/jetpack-compose.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/laravel.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/nextjs.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/nuxt-ui.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/nuxtjs.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/react-native.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/react.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/shadcn.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/svelte.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/swiftui.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/threejs.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/uno.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/uwp.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/vue.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/winui.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/stacks/wpf.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/styles.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/typography.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/ui-reasoning.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/data/ux-guidelines.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/core.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/design_system.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/reasoning_contract.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/search.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/google-api.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/google-catalog.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/google-existing.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/google-metadata.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/google-overrides.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/icons-curated.csv` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/phosphor-core.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/phosphor-package.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/phosphor-react-exports.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/catalogs/phosphor-react-package.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/relevance-baseline.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/relevance-cases.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/fixtures/relevance-thresholds.json` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_catalog_refresh.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_core.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_core_data_quality.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_data_contracts.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_design_system_mode.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_native_desktop_stack_freshness.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_relevance_evaluator.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_style_taxonomy.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_text_layout_resilience.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/tests/test_web_stack_freshness.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `.agents/skills/ui-ux-pro-max/scripts/validate_data.py` | LOCAL ONLY | Imported development skill; no KEN runtime/build dependency. |
| `client/e2e/responsive/audit.ts` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/e2e/responsive/detector.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `client/e2e/responsive/fixtures.ts` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/e2e/responsive/reporter.ts` | KEEP | KEN test detector/helper/fixture/baseline/reporting source. |
| `client/e2e/responsive/responsive.spec.ts` | KEEP | Executable KEN feature regression tests. |
| `docs/RESPONSIVE_FINDINGS_2026-10-05.md` | EXCLUDE | Dated findings; keep unresolved image defect in an issue. |
| `docs/RESPONSIVE_TESTING.md` | KEEP | Maintained feature/API/deployment/testing instructions. |
| `playwright.config.ts` | EXCLUDE | Root Playwright website demo scaffold; assess config/tests together. |
| `playwright.responsive.config.ts` | KEEP | KEN responsive suite selected by npm script. |
| `tests/example.spec.ts` | EXCLUDE | Root Playwright website demo scaffold; assess config/tests together. |

</details>

### Audit verification

A SHA-256 aggregate over every original tracked and eligible untracked file was compared with the starting snapshot while preparing this report. Existing file contents and that file set were unchanged. Only this newly requested report was added; ignored live/generated data was not modified by the audit.
