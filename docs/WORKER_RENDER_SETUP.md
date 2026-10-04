# Cloudflare and Render: Worker-only AI configuration

The updated Worker accepts `GEMINI_KEYS`. Adding that secret to the previous
Worker version is not sufficient: deploy both the new Worker bundle and the
updated Express code. This routes supported Gemini, Groq, Cerebras, DeepSeek and
Cloudflare models through `kenai` without Cloudflare AI Gateway. Gemini native
image/PDF input and image generation also use the Worker.

## 1. Cloudflare: publish the new Worker first

Dashboard -> Workers & Pages -> **kenai** -> **Edit code**.
Copy the complete contents of `worker/Ken-AI-Worker.js`, replace the main module
and Deploy. Source for future edits: `worker/src/index.ts`.

Dashboard -> **kenai -> Settings -> Variables and Secrets**. Store API keys as
type **Secret**, not plain text variables. If keys were added as plain text,
replace those entries with Secrets using the same names and values. Do not
paste keys into the JavaScript file.

| Secret name | Value |
| --- | --- |
| `KEN_API_KEY` | One shared random secret; must exactly match Render |
| `GEMINI_KEYS` | Gemini API key, or comma-separated key pool |
| `GROQ_KEYS` | Groq API key, or comma-separated key pool |
| `CEREBRAS_KEYS` | Cerebras API key, or comma-separated key pool |
| `DEEPSEEK_API_KEY` | Official DeepSeek API key, or comma-separated key pool |

The code also accepts `GEMINI_API_KEY`, `GROQ_API_KEY`, `GROQ_KEY`,
`CEREBRAS_API_KEY`, `CEREBRAS_KEY` and `DEEPSEEK_KEY` aliases. You only need one
name per provider unless intentionally pooling multiple keys.

On the **Bindings** tab, confirm a **Workers AI** binding named **AI**. Cloudflare
inference runs with this binding; `CF_ACCOUNT_ID`/`CF_TOKEN` are not required in
this Worker. Old `CT_AI_KEY`, `CLAUDE_KEY` and `AI_GATEWAY_ID` are not used by the
updated code and can be removed. `CLAUDE_KEY` from the supplied legacy code was
for AgentRouter, not official DeepSeek.

Keep the existing `workers.dev` address and `ai.ken-ai.tech` custom domain. No DNS
change is required when they already target `kenai`. `ALLOWED_ORIGINS` is optional
and defaults to `https://ken-ai.tech,https://www.ken-ai.tech`. Express calls the
Worker server-to-server, so its URL does not need to be added as a browser origin.

## 2. Render: add these on the Express API service

Dashboard -> **ken-ai-api** (or your actual Express service name) -> **Environment**.

```dotenv
CLOUDFLARE_WORKER_URL=https://kenai.syedarslanshah7861.workers.dev/v1
KEN_API_KEY=the_exact_same_secret_you_set_on_the_worker
IMAGE_GENERATION_PROVIDER=cloudflare
```

Use `/v1` at the end of the Worker URL. If the custom domain is active, you can
instead use `https://ai.ken-ai.tech/v1`. Do not use the Express health URL here.

`IMAGE_GENERATION_PROVIDER=cloudflare` keeps Cloudflare first for images, with
Gemini as a fallback via the Worker. Choose `gemini` instead if Gemini should be
the primary image provider. No provider API key is needed on Render for either.

## 3. Render: remove old variables for migrated AI providers

Once the new Worker is deployed and the matching shared secret is configured,
remove these entries **if present**:

```text
CF_AI_GATEWAY_TOKEN
CF_AI_GATEWAY
GEMINI_KEYS
GEMINI_API_KEY
GROQ_KEYS
GROQ_API_KEY
GROQ_KEY
CEREBRAS_KEYS
CEREBRAS_API_KEY
CEREBRAS_KEY
DEEPSEEK_API_KEY
DEEPSEEK_KEY
CF_ACCOUNT_ID
CF_TOKEN
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
CLOUDFLARE_API_KEY
AI_GATEWAY_ID
CT_AI_KEY
CLAUDE_KEY
```

The Cloudflare account/token entries above are removable for **this app's AI
inference** in Worker mode. Keep a credential if you use it for a separate
deployment/integration outside this application. `STORAGE_*` R2 credentials are
different and must be kept.

For this Cloudflare/Gemini image setup, remove `IMAGE_GENERATION_API_KEY` if it
was only used for the old image provider. The app interprets it as an OpenAI
image key; leaving it present can retain an unintended direct OpenAI fallback.
Keep `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `VOICE_API_KEY`, `VOICE_PROVIDER` or
other provider settings only if you still use those separate integrations.
OpenAI/OpenRouter and speech endpoints are not migrated by this change.

## 4. Render: keep the application variables

Do not remove or rotate the following during the AI migration:

| Group | Variables / settings to keep |
| --- | --- |
| Database | `MONGODB_URI` (or existing `MONGO_URI` alias) |
| Authentication | `JWT_SECRET`, `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `ENCRYPTION_KEY`, `INITIAL_ADMIN_EMAIL` |
| Google login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` |
| Email | `RESEND_API_KEY`, `EMAIL_FROM` and/or `RESEND_FROM_EMAIL` |
| File uploads/R2 | All `STORAGE_*` settings and `FILE_MAX_BYTES` |
| Browser origins/cookies | `CLIENT_URL`, `COOKIE_DOMAIN` |
| Optional services | `REDIS_URL`, `SENTRY_DSN`, search/voice/analysis configuration still in use |
| App controls | Logging, rate-limit variables, `AUTO_MODE_DAILY_TOKEN_CEILING`, fallback model choices still in use |

Required production values:

```dotenv
NODE_ENV=production
CLIENT_URL=https://ken-ai.tech,https://www.ken-ai.tech
COOKIE_DOMAIN=.ken-ai.tech
GOOGLE_CALLBACK_URL=https://api.ken-ai.tech/api/auth/google/callback
ENABLE_DEV_AUTH_TOOLS=false
ENABLE_MOCK_AI=false
```

Keep your existing database/auth/email/storage values. Render injects `PORT`;
the app already reads it. Changing `ENCRYPTION_KEY` would invalidate stored
encrypted provider credentials and is not part of this setup.

## 5. Render: deploy updated code, not just environment variables

Commit/push the updated repository to the branch configured for your Render
service, then deploy that latest commit. This workspace has not been pushed or
deployed automatically. Check these service settings:

| Setting | Value |
| --- | --- |
| Root directory | Empty: repository root |
| Build command | `npm ci --include=dev && npm run build -w @Ken/shared && npm run build -w @Ken/server` |
| Start command | `npm run start -w @Ken/server` |
| Health check path | `/api/health` |
| Custom domain | Keep `api.ken-ai.tech` |

The updated `render.yaml` declares the Worker URL, shared-secret prompt and
Cloudflare image preference rather than asking for Gemini/Groq provider keys.
Existing Render services still need their old variables removed manually.

Use **Save, rebuild, and deploy** when saving the new variables if the updated
commit is already the deployed branch head. Merely choosing **Save only** does
not activate them. **Save and deploy** uses the existing build, so it does not
replace old code with these Gemini changes.

## 6. Frontend and verification

Keep the frontend/Vercel variable:

```dotenv
VITE_API_BASE_URL=https://api.ken-ai.tech/api
```

Do not point the frontend at `ai.ken-ai.tech`; users must still authenticate
through Express. Do not add any provider key or `KEN_API_KEY` as `VITE_*`.
No frontend redeploy is required just for this server/Worker migration if its
API base URL is already correct. Redeploy the frontend if you change that URL.

After both deployments:

1. Check `https://kenai.syedarslanshah7861.workers.dev/health`: expect HTTP 200
   with `ok: true`. This checks the AI binding/shared-secret presence, not vendor
   key validity or successful inference.
2. Check `https://api.ken-ai.tech/api/health`: expect a healthy Express response.
3. Open Ken AI and confirm supported Gemini/Groq/Cerebras/DeepSeek/Cloudflare
   models appear when enabled. Discovery hides models for missing/invalid vendor
   secrets; an account may also lack access to a specific model.
4. Test a short selected-model chat on each provider, streamed text, Gemini
   image/PDF input, and an image generation request. Confirm Worker requests in
   Cloudflare logs and investigate failures in Render logs.

The generated JavaScript, local typechecks and mock-based tests do not prove
that deployed provider credentials or account billing are valid. No live paid
generation is performed by the health endpoints.

References: [Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Render environment updates](https://render.com/docs/configure-environment-variables),
[Gemini compatibility](https://ai.google.dev/gemini-api/docs/openai),
[Gemini native generation](https://ai.google.dev/api/generate-content).
