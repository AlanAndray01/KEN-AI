/**
 * The shared briefing every agent receives.
 *
 * These are the KEN AI house rules, mirrored from `.cursor/rules/*.mdc`. They
 * are inlined rather than read from disk at runtime so a mission is reproducible
 * and so the agents cannot be steered by an edit to a rules file mid-run.
 * If `.cursor/rules/` changes materially, update this file to match.
 */

export const PROJECT_BRIEF = `
# Project: KEN AI (package name "aether")

A production MERN + TypeScript AI chat platform, organised as npm workspaces:

- \`client/\` — React 19 + Vite + TypeScript + Tailwind. Vite bundler resolution
  (no \`.js\` suffixes on local imports). Tests: Vitest + React Testing Library.
- \`server/\` — Express + TypeScript + Mongoose/MongoDB. ESM + NodeNext, so local
  imports MUST carry a \`.js\` extension. Tests: Vitest + Supertest against the
  exported \`app\` (never listen on a port in a test).
- \`shared/\` — \`@aether/shared\`: DTOs, constants and Zod schemas used by both sides.

This is strictly a WEB application. There is no mobile, Android, Kotlin or
Jetpack Compose code in this repository; ignore any such reference.

## Layering (do not violate)

React → Express routes → controllers → services → models → MongoDB.
AI calls: controller → \`AIProviderManager\` → provider adapter → external API.
Tools: \`AIProviderManager\` → \`ToolManager\` → tool implementation.

## Hard rules

1. **Frontend boundaries.** React talks only to the Express API through the
   modules in \`client/src/services\` (\`api.auth\`, \`api.chat\`, …). Never scatter
   raw \`fetch\`/\`axios\` through components. React must never import an AI vendor
   SDK, Mongoose, or a MongoDB driver, and must never read provider credentials.
2. **Provider abstraction.** Gemini is the first adapter, not the system. Never
   call a vendor SDK outside \`server/src/services/ai/providers/\`. Application
   code goes through \`AIProviderManager\`. Responses normalise through
   \`services/ai/normalizers/\`.
3. **Backend security.** Validate every request server-side with Zod; frontend
   validation is UX only. Authenticated routes use the auth middleware, admin
   routes require \`role === 'admin'\`. Helmet, a \`CLIENT_URL\` CORS allowlist and
   centralised error handling are mandatory. Never return stack traces in
   production, and never return \`passwordHash\` or a raw API key.
4. **Secrets.** Never commit or print \`.env\`, API keys, JWT secrets or private
   keys. Provider keys live in server env or encrypted Mongo fields; API
   responses may expose masked keys only (\`sk-••••1234\`). Nothing secret may
   reach React, \`localStorage\`, \`sessionStorage\` or a \`VITE_*\` variable —
   \`VITE_API_BASE_URL\` and similar non-secret public config are the exception.
5. **Honest capability.** If a feature cannot run safely yet, keep the
   abstraction, contract and UI, and return a clear "not configured"/"unavailable"
   error. Never fabricate AI replies, search hits or analysis results. Mock AI is
   isolated and gated behind \`ENABLE_MOCK_AI=true\`. Never execute AI-generated
   code inside the Express process.
6. **TypeScript.** \`strict\` stays on. Prefer named exports. Share DTOs via
   \`@aether/shared\`. Avoid \`any\`; if a vendor type forces it, isolate it and
   leave a comment explaining why.
7. **Dependencies.** Reuse the existing layouts, inputs, dialogs and API client
   instead of adding one-off copies. Do not add a library unless the spec
   requires it or it is clearly simpler than in-house code. Never introduce
   Next.js, Firebase, Supabase or a second UI kit. A new dependency belongs to
   the workspace that uses it, not the root.
8. **Testing.** Vitest everywhere. Never hit a real paid AI API from a unit
   test — inject a fake adapter. Never assert on secrets or on log output that
   could contain credentials.
`.trim();

/** Output contract shared by every specialist. */
export const REPORTING_CONTRACT = `
# How to report

Finish by returning the required JSON object. It is a contract, not a summary:

- \`summary\`: 2-4 sentences a senior engineer can act on. No filler.
- \`verdict\`: "pass" (nothing actionable), "warn" (real issues, nothing urgent),
  or "fail" (at least one high/critical issue, or you could not complete the task).
- \`findings\`: one entry per concrete problem. Every entry needs a repo-relative
  \`file\` and, where you can pin it, a \`line\`. \`detail\` explains what breaks and
  under which input or state; \`recommendation\` says what to change. Grade
  severity by real impact, not by how easy the fix is.
- \`filesChanged\`: repo-relative paths you actually modified. Empty in read-only
  mode — do not list files you merely considered changing.
- \`followUps\`: work you deliberately did not do, so a human can pick it up.

Rules that matter more than volume:

- Report only what you verified by reading the code. Never guess at a file you
  did not open, and never invent a line number.
- If you find nothing, say so with \`verdict: "pass"\` and an empty findings list.
  A short honest report beats a padded one.
- Never quote a secret, credential or token value in any field. Refer to the
  location instead ("hard-coded key at server/src/x.ts:42").
`.trim();

/**
 * Investigation discipline. Agents that skip this tend to report style opinions
 * instead of defects, which is the main failure mode of an automated review.
 */
export const METHOD_BRIEF = `
# Method

1. Orient first: use Glob/Grep to map the relevant files before reading them.
2. Read the actual implementation. A finding must be traceable to code you read.
3. Prefer depth over breadth. Three verified, precisely located defects are
   worth more than twenty speculative ones.
4. Distinguish a defect (wrong behaviour, security hole, broken contract) from a
   preference (naming, formatting). Report defects; mention preferences only if
   they cause real maintenance pain.
5. Respect the existing architecture. Recommend changes that fit the layering
   above rather than proposing a rewrite.
`.trim();
