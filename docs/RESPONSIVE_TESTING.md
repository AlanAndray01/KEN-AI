# Responsive layout testing

The first complete run and its confirmed source-level findings are recorded in [RESPONSIVE_FINDINGS_2026-10-05.md](RESPONSIVE_FINDINGS_2026-10-05.md).

Run from the repository root:

```powershell
npm run test:responsive
npm run test:responsive -- --project=375x812
npm run test:responsive -- --project=1280x720 --grep "Square image"
npm run test:responsive -- --project=detector
npx playwright show-report client/playwright-report/responsive-html
```

The frontend is the `@Ken/client` Vite workspace (`npm run dev -w @Ken/client`), at **http://localhost:5173** with a strict port. The separate `playwright.responsive.config.ts` launches the same Vite frontend directly (avoiding nested npm processes on Windows) or reuses that URL locally; no Express process is required. It enables the local landing page when starting a server. If an existing server disabled the landing page, stop it before running; the landing readiness assertion will fail rather than report false coverage.

The existing root `playwright.config.ts`, `tests/example.spec.ts`, client `playwright.config.ts`, `client/e2e/agents` tests, `test:e2e` script, and CI workflow are preserved. Playwright and Chromium were already installed. This suite uses a separate test directory and report/output folders, so it does not change existing test discovery.

## Coverage and checks

Each route/state runs at 320x568, 360x800, 375x812, 390x844, 430x932, 768x1024, 1024x768, 1280x720, 1440x900 and 1920x1080. Coverage includes landing, legal, auth/OTP, shared chat, missing route, empty/text/image chats, history and redirect, populated library/GPT pages and editor, all settings routes, all admin routes, open model menu/sidebar, and image viewer. Desktop sizes also exercise the persistent sidebar.

APIs return deterministic guest/user/admin fixtures. All API requests are intercepted, mutations are blocked, and external traffic is blocked. The square SVG is served from the mocked file-content endpoint and exercises the application's actual blob/image loading path. These tests consume **zero AI neurons** and never log into a real account.

The scanner checks document scroll width and rendered HTML/SVG-root boxes against the viewport, with a 1.5px rounding tolerance. It reports elements even when outer page clipping hides their overflow. Matching CSS/inline width and min-width declarations are captured as diagnostic candidates; computed pixel width alone is not labeled a fixed-width rule. A dedicated image-only reply contract checks excessive empty card width and stretched image aspect ratios. `object-fit: contain` is accounted for when calculating the painted image width.

Intentional exceptions are recorded in each JSON audit: unrendered/transparent/inert subtrees, screen-reader-only content, the auth grain background, a fully closed translated mobile sidebar, fully inactive landing story panels outside their clipped stage, and content inside bounded explicit horizontal scroll containers (such as admin tables, swipe carousels or code blocks). The scroll containers themselves are still checked. No general body `overflow: hidden` exemption exists. SVG paths are not separate layout boxes. This is horizontal layout auditing, not a complete accessibility, vertical clipping, or pixel-comparison test suite.

Readiness assertions prevent loaders, login redirects, crashed pages, missing fixtures, or unloaded images from passing. Detector self-tests cover fixed/min widths, clipped-page escapes, bounded scrolling, negative positioning and hidden content.

## Failure artifacts

- `client/playwright-report/responsive-audit/results.md`: readable findings with URL, viewport, selector, width, left/right position, viewport width, matched width rules, source candidates and screenshot links.
- `client/playwright-report/responsive-audit/results.json`: all measured audits, failures and intentional exclusions.
- `client/playwright-report/responsive-html/index.html`: interactive Playwright report with screenshots and traces.
- `client/test-results/responsive/`: per-test viewport screenshots, full-page failure screenshots, JSON attachments and retained failure traces.

Generated reports are already covered by existing `.gitignore` rules. A layout failure exits nonzero. No baseline update, UI repair, production deployment or CI modification happens automatically. For a new page, add its route, readiness assertion and fixture to this suite.
