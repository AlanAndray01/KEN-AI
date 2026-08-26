# Ken

Ken is a production-oriented MERN TypeScript AI assistant platform. The React client talks only to an Express API. MongoDB is the source of truth. AI providers (Groq first, then OpenAI, Anthropic, OpenRouter, Ollama, and custom OpenAI-compatible APIs) are adapters behind a server-side provider manager. Provider API keys never leave the server.

This repository is a npm workspaces monorepo:

```
client/    React + Vite + Tailwind CSS
server/    Express.js + TypeScript
shared/    Types, constants, and Zod schemas
docs/      HTTP API reference
```

## Architecture

```
React  →  Express API  →  controllers  →  services  →  MongoDB
                              ↓
                    AIProviderManager
                              ↓
                      Provider adapter
                              ↓
                      External AI API
```

Tools: `AIProviderManager` → `ToolManager` → tool implementation.

The frontend does not import vendor AI SDKs and does not connect to MongoDB. Application code talks to `AIProviderManager`, never to a vendor SDK.

HTTP API: [docs/API.md](docs/API.md).

## Technology stack

- **Client:** React, TypeScript, Vite, Tailwind CSS, React Router, TanStack Query, Zustand, Lucide React
- **Server:** Node.js, Express, TypeScript, MongoDB/Mongoose, Zod, Helmet, CORS, Pino
- Auth: email/password with 6-digit email verification + Google OAuth, httpOnly JWT + revocable sessions
- AI: `AIProvider` adapters behind `AIProviderManager`, Groq first, encrypted admin/user keys
- Chat: conversation/message persistence, SSE streaming, abort, regenerate, usage records
- UI: ChatGPT-style workspace, grouped history, markdown, themes, toasts, keyboard shortcuts
- Files: local StorageService, authenticated uploads, vision gating
- Tools: ToolManager, web search, image generation, STT/TTS, isolated analysis jobs
- Memory + GPTs: custom instructions, memory CRUD, GPT builder/store, composer @mentions
- Product surfaces: read-only share links, Markdown/JSON/TXT export, settings, usage dashboard, library, unsent drafts
- Hardening: rate limits, Helmet/CORS, sanitization, log redaction, optional fallback provider

## Prerequisites

- Node.js 20 or newer (Node 24 is supported)
- npm 10+
- MongoDB (local, Docker, or Atlas)

## Setup

```bash
npm install
```

Copy environment templates (never commit real `.env` files):

```bash
copy server\.env.example server\.env
copy client\.env.example client\.env
```

On macOS/Linux use `cp` instead of `copy`.

Fill in `server/.env`. `MONGODB_URI` is required for a working API. Never commit that file.

## Development commands

From the repository root:

| Command | Description |
| --- | --- |
| `npm run dev` | Shared watch + Express + Vite together |
| `npm run client` | Vite only |
| `npm run server` | Express only (builds shared first) |
| `npm run build` | Production build of all workspaces |
| `npm run test` | Vitest in each workspace |
| `npm run lint` | ESLint in each workspace |
| `npm run typecheck` | TypeScript no-emit in each workspace |

Default URLs:

- Client: http://localhost:5173
- API: http://localhost:5000
- Health: http://localhost:5000/api/health

## Environment variables

**Client (public only):** `VITE_API_BASE_URL` — e.g. `http://localhost:5000/api`

Never put `GROQ_API_KEY`, `OPENAI_API_KEY`, `MONGODB_URI`, or JWT secrets in `VITE_*` variables.

**Server:** see `server/.env.example`. Provider keys are optional; a provider works only when configured. Mock AI is off unless `ENABLE_MOCK_AI=true` (ignored in production).

When `NODE_ENV=production`, the server refuses to start unless `JWT_SECRET` (16+ characters) and `MONGODB_URI` are set — it will not fall back to a generated secret. In development, secrets are generated per machine and stored in a gitignored `server/.dev-secrets.json`; no usable secret is committed to the repository.

## Database

MongoDB is the source of truth. The API connects on startup using `MONGODB_URI` from `server/.env`. `GET /api/health` reports `database.status` as `connected`, `disconnected`, or `not_configured`. Connection strings are never logged or returned from the API.

Mongoose models (separate collections, not one large User document): User, Conversation, Message, Attachment, File, AIProvider, AIModel, CustomGPT, Memory, CustomInstruction, SharedConversation, UsageRecord, Session, Notification, PasswordReset, VerificationToken.

Messages are stored per conversation with pagination-friendly indexes. `passwordHash`, refresh tokens, and encrypted provider keys are `select: false` and stripped from JSON.

## Authentication

Email/password auth is live. Local registration creates an unverified user and emails a 6-digit code (hashed, 15-minute expiry). The API does not issue a session until `POST /api/auth/verify-email` succeeds. Google accounts are treated as verified. Sessions use HttpOnly JWT cookies (`Ken_access`, `Ken_refresh`) with SameSite=Strict (SameSite=None only when `COOKIE_DOMAIN` is set for cross-subdomain deploys). Tokens are never stored in `localStorage`. `GET /api/auth/me` hydrates the client. Passwords are hashed with argon2id. `passwordHash` is never returned.

Google sign-in is a backend OAuth redirect:

1. Create an OAuth client (Web) in Google Cloud Console.
2. Authorized redirect URI: `http://localhost:5000/api/auth/google/callback`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `server/.env`.
4. Visit `/login` and use Continue with Google.

If Google is not configured, the API redirects to `/login?error=google_not_configured` instead of faking a login.

Password reset and email verification send mail when `RESEND_API_KEY` is set. The sender is `EMAIL_FROM` or `RESEND_FROM_EMAIL` (plain address or `Ken <onboarding@resend.dev>`). In development, that Resend test sender is the default if From is omitted. Signup still works without Resend: the hashed 6-digit code is stored, and the API terminal prints `🔑 VERIFICATION CODE FOR <email> : 123456`. Set `ENABLE_DEV_AUTH_TOOLS=true` in development to also receive `resetToken` or `verificationCode` in JSON. Production refuses to boot if that flag or `ENABLE_MOCK_AI` is enabled. Optional `INITIAL_ADMIN_EMAIL` grants `admin` on first registration of that address.

Dummy `@example.com` / `@example.test` records can be removed without dropping collections:

```bash
CLEAR_DUMMY_DATA=true npm run clear:dummy -w @Ken/server
```

## Provider setup

Provider keys stay on the server (environment variables or AES-256-GCM encrypted MongoDB fields). The API never returns raw keys — only a masked suffix (`••••` + last four).

**Groq (primary adapter):** set `GROQ_API_KEY` in `server/.env`. Chat completions stream over SSE. Default model is `openai/gpt-oss-20b` (Groq retired Llama 3.1/3.3 IDs on 2026-08-16). One Groq key unlocks every Groq model in the header dropdown. Gemini is no longer used.

Optional keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`. Custom OpenAI-compatible endpoints and Ollama are configured by an admin. Persist database keys with `ENCRYPTION_KEY` (required in production). Users can save personal keys through Settings or `POST /api/settings/keys`; those values are encrypted in MongoDB and never written to `.env`.

If no provider is configured, the API returns `"No AI provider configured."` Mock AI is isolated behind `ENABLE_MOCK_AI=true` and is disabled in production.

Optional tool env vars: `SEARCH_PROVIDER` (`tavily` | `brave` | `serper`) + `SEARCH_API_KEY`; `IMAGE_GENERATION_PROVIDER=openai` + `IMAGE_GENERATION_API_KEY` (or `OPENAI_API_KEY`); `VOICE_PROVIDER=openai` + `VOICE_API_KEY` (or `OPENAI_API_KEY`); `ANALYSIS_RUNNER_URL` for an isolated Python sandbox. Unconfigured tools return a clear 503. The API never invents search hits, images, transcripts, or analysis output. Data-analysis code is never executed inside the Express process.

Full route list: [docs/API.md](docs/API.md).

Streaming uses `text/event-stream`. Stop aborts the in-flight generation and keeps the partial assistant message. ContextManager trims history to the model context window. Each generation writes a `UsageRecord`.

Credential order at generation time: user key → encrypted database key → environment key. The manager does not silently switch models. If Groq 20B is rate-limited, it hops once to `AI_FALLBACK_PROVIDER_ID` / `AI_FALLBACK_MODEL_ID` when those are set (for example Groq 120B). It does not bounce to OpenAI on its own.

## Testing

```bash
npm run test
```

Do not call paid AI APIs from unit tests. Inject fake adapters.

Integration tests in `server/src/routes/*.integration.test.ts` run against a real MongoDB started in memory by `mongodb-memory-server`, so auth and chat routes are exercised with genuine queries, unique indexes, and schema validation. On Windows this needs the [Microsoft Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist?view=msvc-170); without it those suites skip with an explanatory message instead of failing.

Health (no secrets in the payload):

```bash
npm run verify:health -w @Ken/server
```

MongoDB connectivity (prints only `connected` / `disconnected` / `not_configured`):

```bash
npm run verify:db -w @Ken/server
```

## Deployment

1. Set production env in `server/.env` (never commit it): `NODE_ENV=production`, `MONGODB_URI`, `JWT_SECRET` (16+ characters), `ENCRYPTION_KEY` (16+ characters), `CLIENT_URL` (the public origin that serves the SPA), optional `COOKIE_DOMAIN`.
2. Leave `ENABLE_MOCK_AI=false` and `ENABLE_DEV_AUTH_TOOLS=false`.
3. Build from the repo root:

```bash
npm run build
```

4. Run the API:

```bash
node server/dist/server.js
```

Or `npm run start -w @Ken/server`.

In production, Express serves `client/dist` (static assets + SPA fallback for non-`/api` GET routes) when that folder exists after the client build. You can also put `client/dist` behind a reverse proxy or static host and point `CLIENT_URL` at that origin; CORS allows only `CLIENT_URL`.

5. Confirm `GET /api/health` returns `status` and `database.status` without secrets.

Uploads default to `server/uploads` (`STORAGE_DIRECTORY`). Keep that directory off git. For object storage, set `STORAGE_PROVIDER` (`s3` | `r2` | `cloudinary`) and the matching keys in `server/.env.example`.

## Security notes

- Provider API keys are server-side only
- Do not commit `.env`, `uploads/` contents, or private keys
- Stack traces are not returned in production
- Secrets must never appear in logs
- Auth, chat, upload, search, image, and voice routes are rate limited (429)
- CORS allows only `CLIENT_URL`; Helmet sets deny-framing and no-referrer
- Optional `AI_FALLBACK_PROVIDER_ID` retries a configured provider after a runtime failure — it does not silently switch models when unset

## Current phase

**Phase 12 — v1 quality gate complete.** API documentation, accessibility and keyboard pass, production SPA serving, architecture review, and the typecheck / lint / test / build gate are in place. There is no Phase 13 in the v1 plan.
