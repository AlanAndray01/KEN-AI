# Ken API

Base URL in development: `http://localhost:5000`. All routes below are prefixed with `/api` unless noted.

The React client talks only to this API. Provider keys, JWT secrets, MongoDB URIs, and OAuth secrets never appear in responses, logs, or client env (`VITE_*`). Masked keys use `••••` plus the last four characters.

Cookies (httpOnly, `SameSite=lax`, `Secure` in production):

| Cookie | Path | Lifetime | Purpose |
| --- | --- | --- | --- |
| `aether_access` | `/` | 15 minutes | Access JWT |
| `aether_refresh` | `/api/auth` | 7 days | Refresh token (revocable session in MongoDB) |

Send cookies with `credentials: include`. Do not put tokens in `localStorage`.

## Errors

Failed JSON responses use:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required",
    "requestId": "…"
  }
}
```

`details` may appear in non-production for validation errors. Stack traces are never returned. Production 500s use a generic message.

| Status | Typical codes |
| --- | --- |
| 400 | `VALIDATION_ERROR`, `UPLOAD_FAILED` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | Conflict (duplicate email, etc.) |
| 413 | `FILE_TOO_LARGE`, `PAYLOAD_TOO_LARGE` |
| 429 | `RATE_LIMITED` |
| 503 | Provider or tool not configured |

Every response includes `X-Request-Id`. Rate-limited routes also set `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (unix seconds). A 429 adds `Retry-After` (seconds).

## Health

### `GET /api/health`

Public. Never returns connection strings or keys.

```json
{
  "status": "ok",
  "timestamp": "2026-08-15T00:00:00.000Z",
  "service": "ken-api",
  "database": { "status": "connected" }
}
```

`status` is `ok` or `degraded`. `database.status` is `connected`, `disconnected`, or `not_configured`.

## Auth

Rate limited (`RATE_LIMIT_AUTH`, default 10 / 60s) except logout, me, and Google callback. Password reset, email verification, and resend-code use `RATE_LIMIT_PASSWORD_RESET` (default 5 / 60s).

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | No | Body: `{ name, email, password }`. Creates an unverified user, emails a hashed 6-digit code (15-minute TTL), and does **not** set cookies. Response: `{ requiresVerification: true, email, emailSent }`. In test/`ENABLE_DEV_AUTH_TOOLS` only, `verificationCode` is included. |
| `POST` | `/api/auth/verify-email` | No | Body: `{ email, code }`. On success sets cookies and marks `isVerified: true`. |
| `POST` | `/api/auth/resend-code` | No | Body: `{ email }`. Always `{ ok: true }` (no email enumeration). Sends a new code only if that local account is unverified. |
| `POST` | `/api/auth/login` | No | Body: `{ email, password }`. Sets cookies when the account is verified. If credentials are valid but `isVerified` is false: `403 EMAIL_NOT_VERIFIED` with `requiresVerification: true` and a new code is sent. |
| `POST` | `/api/auth/logout` | Cookies | Clears cookies and revokes the session. |
| `GET` | `/api/auth/me` | Yes | Current user. Never includes `passwordHash`. |
| `POST` | `/api/auth/refresh` | Refresh cookie | Rotates tokens. |
| `POST` | `/api/auth/forgot-password` | No | Hashed reset token stored. Email sending is not configured. In development only, `ENABLE_DEV_AUTH_TOOLS=true` may include `resetToken` in JSON — never enable in production. |
| `POST` | `/api/auth/reset-password` | No | Body: `{ token, password }`. |
| `POST` | `/api/auth/change-password` | Yes | Body: `{ currentPassword, newPassword }`. |
| `GET` | `/api/auth/google` | No | Redirects to Google with a random CSRF `state`, also stored in a short-lived httpOnly cookie. If unset, redirects to `/login?error=google_not_configured`. |
| `GET` | `/api/auth/google/callback` | No | OAuth callback. The `state` must match the cookie or the request is rejected with `/login?error=google_state`. The cookie is cleared on every callback, so a `state` cannot be replayed. |
| `POST` | `/api/auth/google` | No | Body: Google ID token (alternative to redirect). |

Passwords are hashed with argon2id. `passwordHash` is `select: false` and stripped from JSON. Email verification codes are stored as SHA-256 hashes in `verification_tokens` with a 15-minute TTL; plaintext codes are never stored. Google sign-in marks the account verified. Existing local accounts without `isVerified: false` can still sign in. Session JWTs are HttpOnly cookies (`aether_access` / `aether_refresh`), never `localStorage`. Production rejects `ENABLE_DEV_AUTH_TOOLS` and `ENABLE_MOCK_AI`.

## Models and providers

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/models` | Yes | Enabled models from configured providers. |
| `GET` | `/api/providers` | Yes | Provider status without secrets (`configured`, masked suffix). |

If no provider is configured, chat returns a clear error such as `"No AI provider configured."` The API does not invent completions.

## Current user (`/api/me`)

All routes require auth.

| Method | Path | Notes |
| --- | --- | --- |
| `PATCH` | `/api/me` | Name and preferences (`theme`, `language`, `sendOnEnter`, `selectedProviderId`, `selectedModelId`). |
| `GET` | `/api/me/usage` | Token/request totals for the current user. |
| `GET` | `/api/me/export?format=md\|json\|txt` | Download all conversations. |
| `GET` | `/api/me/provider-credentials` | Masked BYOK status only. |
| `PUT` | `/api/me/provider-credentials/:providerId` | Body: `{ apiKey }`. Stored encrypted. Response is masked. |
| `DELETE` | `/api/me/provider-credentials/:providerId` | Removes the user key. |
| `POST` | `/api/settings/keys` | Body: `{ providerId, apiKey, modelId?, label? }`. Encrypts the key in MongoDB. Never writes `.env`. Response is masked. Gemini is rejected. |
| `GET` | `/api/me/instructions` | Custom instructions. |
| `PUT` | `/api/me/instructions` | Body: `{ aboutUser, howToRespond, additional }`. |

Credential order at generation time: user key → encrypted database key → environment key.

## Conversations and chat

Auth required. Chat send/regenerate are rate limited (`RATE_LIMIT_CHAT`, default 60 / 60s).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/conversations` | Sidebar list for the current user (title/timestamps, not message bodies). |
| `POST` | `/api/conversations` | Create. Optional `title`, `providerId`, `modelId`, `customGptId`. |
| `GET` | `/api/conversations/:id` | One conversation. Ownership is `userId`. |
| `PATCH` | `/api/conversations/:id` | Title, pin, archive. |
| `DELETE` | `/api/conversations/:id` | Delete the thread and its messages after an ownership check. |
| `GET` | `/api/conversations/:id/messages` | Paginated messages. |
| `POST` | `/api/conversations/:id/messages` | Send. **SSE** (`text/event-stream`). |
| `POST` | `/api/conversations/:id/messages/:messageId/regenerate` | SSE regenerate. |
| `POST` | `/api/conversations/:id/messages/:messageId/feedback` | Body: `{ rating: "up" \| "down" }`. |
| `POST` | `/api/conversations/:id/generation/abort` | Stop in-flight generation. Partial assistant text is kept. |
| `GET` | `/api/conversations/:id/share` | Current share metadata. |
| `POST` | `/api/conversations/:id/share` | Create or rotate a read-only share token. |
| `DELETE` | `/api/conversations/:id/share` | Revoke. |
| `GET` | `/api/conversations/:id/export?format=md\|json\|txt` | Download one conversation. |
| `POST` | `/api/chat` | SSE send; creates a conversation when needed. |
| `POST` | `/api/chat/abort` | Abort by `generationId`. |

Send body (typical): `{ content, providerId, modelId, attachmentIds?, enabledTools?, customGptId? }`.

### SSE events

Headers: `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.

Each frame is `event: <type>` plus `data: <json>`. Types:

| Event | Payload |
| --- | --- |
| `start` | `conversation`, `userMessage`, `assistantMessage`, `generationId` |
| `chunk` | `text` (delta) |
| `complete` | Final `assistantMessage` |
| `aborted` | Partial `assistantMessage` |
| `error` | `message`, optional `code` (`GENERATION_TIMEOUT` after 180s) |

The stream ends with `data: [DONE]`. User and assistant messages are persisted in MongoDB; the assistant document is finalized after the stream completes. The manager does not silently switch models. If `AI_FALLBACK_PROVIDER_ID` is set and the selected provider fails at runtime, the server retries that configured fallback once.

## Files

Auth required. Uploads are rate limited (`RATE_LIMIT_UPLOAD`, default 20 / 60s). Default max size is 10 MiB (`FILE_MAX_BYTES`).

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/files` | List the current user’s files. |
| `POST` | `/api/files` | `multipart/form-data` field `file`. |
| `GET` | `/api/files/:id` | Metadata. |
| `GET` | `/api/files/:id/content` | Authenticated download. |
| `DELETE` | `/api/files/:id` | Delete. |

Vision attachments are gated by the selected model’s capabilities.

## Tools, voice, analysis

Auth required. Unconfigured tools return **503** with a clear message. The API never invents search hits, images, transcripts, or analysis output. Analysis code never runs inside the Express process.

| Method | Path | Rate limit | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/tools` | — | Tool list plus `configured` / `unavailableReason`. Query: `providerId`, `modelId`. |
| `POST` | `/api/tools/search` | search | Body: `{ query }`. Needs `SEARCH_PROVIDER` + `SEARCH_API_KEY`. |
| `POST` | `/api/tools/images` | image | Body: `{ prompt }`. Needs image provider + key. |
| `GET` | `/api/voice/status` | — | STT/TTS configured flags. |
| `POST` | `/api/voice/transcribe` | voice | Audio upload. |
| `POST` | `/api/voice/speak` | voice | Body: `{ text }`. Returns audio. |
| `POST` | `/api/analysis/jobs` | chat | Isolated runner (`ANALYSIS_RUNNER_URL`). |
| `GET` | `/api/analysis/jobs/:id` | — | Job status/result from the runner. |

## Memory and GPTs

Auth required.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/memories` | List. |
| `POST` | `/api/memories` | Body: `{ content }`. |
| `PATCH` | `/api/memories/:id` | Body: `{ content }`. |
| `DELETE` | `/api/memories/:id` | Delete. |
| `GET` | `/api/gpts` | Query: `scope` (`mine` \| `explore` \| `usable`), `q`, `category`. |
| `POST` | `/api/gpts` | Create. Instructions persist in MongoDB. |
| `GET` | `/api/gpts/:id` | Get if owned or public. |
| `PATCH` | `/api/gpts/:id` | Owner only. |
| `DELETE` | `/api/gpts/:id` | Owner only. |

## Notifications

Auth required.

| Method | Path |
| --- | --- |
| `GET` | `/api/notifications` |
| `POST` | `/api/notifications/:id/read` |
| `POST` | `/api/notifications/read-all` |

## Public share

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/share/:token` | No | Read-only conversation. Sending is disabled. Invalid/revoked tokens are 404. |

## Admin

Auth + `admin` role. Keys in requests are never echoed; responses use a masked suffix.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/admin/providers` | List with `configured` / `keyLastFour`. |
| `POST` | `/api/admin/providers` | Create (encrypted key if provided). |
| `PATCH` | `/api/admin/providers/:id` | Update. |
| `POST` | `/api/admin/providers/:id/test` | Live connection test (not a fake success). |
| `POST` | `/api/admin/providers/:id/enable` | Enable/disable. |
| `DELETE` | `/api/admin/providers/:id` | Delete. |
| `GET` | `/api/admin/models` | Full registry. |
| `PATCH` | `/api/admin/models/:providerId/:modelId` | Enable/disable a model. |
| `GET` | `/api/admin/usage` | Aggregate usage records. |

## Mock AI

`ENABLE_MOCK_AI=true` is ignored in production. Mock adapters are isolated and must not be used as a silent fallback when a real provider is missing.
