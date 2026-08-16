# Aether

Aether is a production-oriented MERN TypeScript AI assistant platform. The React client talks only to an Express API. MongoDB is the source of truth. AI providers (Gemini first, then OpenAI, Anthropic, Groq, OpenRouter, Ollama, and custom OpenAI-compatible APIs) are adapters behind a server-side provider manager. Provider API keys never leave the server.

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
- Auth: email/password + Google OAuth, httpOnly JWT + revocable sessions
- AI: `AIProvider` adapters behind `AIProviderManager`, Gemini first, encrypted admin/user keys
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

Never put `GEMINI_API_KEY`, `OPENAI_API_KEY`, `MONGODB_URI`, or JWT secrets in `VITE_*` variables.

**Server:** see `server/.env.example`. Provider keys are optional; a provider works only when configured. Mock AI is off unless `ENABLE_MOCK_AI=true` (ignored in production).

## Database

MongoDB is the source of truth. The API connects on startup using `MONGODB_URI` from `server/.env`. `GET /api/health` reports `database.status` as `connected`, `disconnected`, or `not_configured`. Connection strings are never logged or returned from the API.

Mongoose models (separate collections, not one large User document): User, Conversation, Message, Attachment, File, AIProvider, AIModel, CustomGPT, Memory, CustomInstruction, SharedConversation, UsageRecord, Session, Notification.

Messages are stored per conversation with pagination-friendly indexes. `passwordHash`, refresh tokens, and encrypted provider keys are `select: false` and stripped from JSON.

## Authentication

Email/password auth is live. Sessions use httpOnly JWT access cookies plus revocable refresh tokens stored in MongoDB. `GET /api/auth/me` hydrates the client. Passwords are hashed with argon2id. `passwordHash` is never returned.

Google sign-in is a backend OAuth redirect:

1. Create an OAuth client (Web) in Google Cloud Console.
2. Authorized redirect URI: `http://localhost:5000/api/auth/google/callback`
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `server/.env`.
4. Visit `/login` and use Continue with Google.

If Google is not configured, the API redirects to `/login?error=google_not_configured` instead of faking a login.

Password reset stores a hashed token. Email sending is not configured yet; set `ENABLE_DEV_AUTH_TOOLS=true` in development to receive `resetToken` in the forgot-password JSON response (never enable that in production). Optional `INITIAL_ADMIN_EMAIL` grants `admin` on first registration of that address.

## Provider setup

Provider keys stay on the server (environment variables or AES-256-GCM encrypted MongoDB fields). The API never returns raw keys — only a masked suffix (`••••` + last four).

**Gemini (first adapter):** set `GEMINI_API_KEY` in `server/.env`. Do not put it in `VITE_*` variables, the client, or git. Requests use the `x-goog-api-key` header, never the key in the URL.

Optional keys: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`. Custom OpenAI-compatible endpoints and Ollama are configured by an admin. Persist database keys with `ENCRYPTION_KEY` (required in production).

If no provider is configured, the API returns `"No AI provider configured."` Mock AI is isolated behind `ENABLE_MOCK_AI=true` and is disabled in production.

Optional tool env vars: `SEARCH_PROVIDER` (`tavily` | `brave` | `serper`) + `SEARCH_API_KEY`; `IMAGE_GENERATION_PROVIDER=openai` + `IMAGE_GENERATION_API_KEY` (or `OPENAI_API_KEY`); `VOICE_PROVIDER=openai` + `VOICE_API_KEY` (or `OPENAI_API_KEY`); `ANALYSIS_RUNNER_URL` for an isolated Python sandbox. Unconfigured tools return a clear 503. The API never invents search hits, images, transcripts, or analysis output. Data-analysis code is never executed inside the Express process.

Full route list: [docs/API.md](docs/API.md).

Streaming uses `text/event-stream`. Stop aborts the in-flight generation and keeps the partial assistant message. ContextManager trims history to the model context window. Each generation writes a `UsageRecord`.

Credential order at generation time: user key → encrypted database key → environment key. The manager does not silently switch models. If `AI_FALLBACK_PROVIDER_ID` is set and the selected provider fails at runtime, it retries that configured fallback once.

## Testing

```bash
npm run test
```

Do not call paid AI APIs from unit tests. Inject fake adapters.

Health (no secrets in the payload):

```bash
npm run verify:health -w @aether/server
```

MongoDB connectivity (prints only `connected` / `disconnected` / `not_configured`):

```bash
npm run verify:db -w @aether/server
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

Or `npm run start -w @aether/server`.

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
