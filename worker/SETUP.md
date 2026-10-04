# Ken AI Worker setup

Ken AI routes Cloudflare Workers AI, Gemini, Groq, Cerebras and DeepSeek through the
`kenai` Worker. Express authenticates with `KEN_API_KEY`; vendor API keys stay in
Worker Secrets. AI Gateway is not used in Worker mode.

## Addresses

| Address | Purpose |
| --- | --- |
| `https://ken-ai.tech` | User-facing application |
| `https://api.ken-ai.tech` | Express API; keep the frontend API URL pointing here |
| `https://api.ken-ai.tech/api/health` | Express health check, not a model endpoint |
| `https://kenai.syedarslanshah7861.workers.dev` | Confirmed Worker base URL supplied by the owner |
| `https://ai.ken-ai.tech` | Worker custom domain shown in the supplied dashboard screenshot |

Use `https://kenai.syedarslanshah7861.workers.dev/v1` as
`CLOUDFLARE_WORKER_URL`. You may replace it with `https://ai.ken-ai.tech/v1` after
confirming the custom domain is active for the same Worker. The `/v1` suffix is
required by Express. Do not use `/api/health` as the model base URL.

## Paste the Worker into Cloudflare

1. Open `worker/Ken-AI-Worker.js` in this project and copy the **entire file**.
   This is the bundled JavaScript file, with all model constants included and
   no local imports. The editable TypeScript source is `worker/src/index.ts`.
2. Cloudflare Dashboard -> Workers & Pages -> **kenai** -> **Edit code**.
3. Replace the existing main JavaScript module with the copied code and Deploy.
   Do not paste the Gmail page text or `src/index.ts` into the JavaScript editor.
4. On the same Worker, open **Bindings**. Ensure there is a **Workers AI** binding
   named exactly **AI**. The local configuration already declares it in
   `worker/wrangler.jsonc`.
5. Open **Settings -> Variables and Secrets -> Add**. Select **Secret** and add
   the values below, then deploy the settings.

| Worker Secret | Value | Where to get it |
| --- | --- | --- |
| `KEN_API_KEY` | One long random secret, identical to Express's `KEN_API_KEY` | Generate your own; not a Cloudflare API token |
| `GEMINI_KEYS` | Gemini API key; optionally comma-separated keys | https://aistudio.google.com/apikey |
| `GROQ_KEYS` | Groq API key; optionally comma-separated keys | https://console.groq.com/keys |
| `CEREBRAS_KEYS` | Cerebras API key; optionally comma-separated keys | https://cloud.cerebras.ai/ -> API Keys |
| `DEEPSEEK_API_KEY` | Official DeepSeek API key; optionally comma-separated keys | https://platform.deepseek.com/api_keys |

`GEMINI_API_KEY`, `GROQ_API_KEY`/`GROQ_KEY` and `CEREBRAS_API_KEY`/`CEREBRAS_KEY` aliases are also
accepted for the pasted code's existing key names. `DEEPSEEK_KEY` is accepted.
The pasted code's `CLAUDE_KEY` targets agentrouter.org; it is not an official
DeepSeek key and is not used here. No spoofed client headers are sent.

`CT_AI_KEY` is replaced by `KEN_API_KEY`. `CF_ACCOUNT_ID` and `CF_TOKEN` are not
required for inference inside this Worker because it uses the `AI` binding.
An old `AI_GATEWAY_ID` variable is ignored by this version.

Cloudflare hides saved secret values. If the old secret cannot be recovered,
set a new shared secret on **both** the Worker and Express. Never put these
secrets in browser code or `client/.env`.

## Configure Express

Local file: `server/.env`.

```dotenv
CLOUDFLARE_WORKER_URL=https://kenai.syedarslanshah7861.workers.dev/v1
KEN_API_KEY=your_actual_matching_secret
CF_AI_GATEWAY_TOKEN=
IMAGE_GENERATION_PROVIDER=cloudflare
```

Replace the placeholder with the actual secret. Fill `KEN_API_KEY` before
activating the Worker URL, then restart Express. Worker mode overrides saved
vendor destinations and personal provider keys for the five listed providers;
it uses the Worker's shared secret for every call. Provider enable/disable
settings are preserved. Vendor availability is checked via Worker discovery.
Other providers, such as OpenAI/OpenRouter, keep their own configured routes; AI
Gateway is disabled whenever Worker mode is active.

Production: **Render Dashboard -> the Express API service -> Environment**.
Set the same four variables and save/redeploy the Express service after
deploying the Worker. Editing local `.env` does not update Render.

## Supported endpoints

All model endpoints require `Authorization: Bearer <KEN_API_KEY>` or
`X-API-Key: <KEN_API_KEY>`.

| Method / path | Behavior |
| --- | --- |
| `GET /health` | Public readiness check for the shared secret and AI binding; does not perform inference |
| `GET /v1/models` | Shared supported Cloudflare model list, including images |
| `POST /v1/chat/completions` | Selected Cloudflare chat/vision model and optional SSE streaming |
| `POST /ai/run/<model-id>` | Supported Cloudflare image models, JSON or multipart input |
| `GET /providers/groq/v1/models` | Groq model discovery using Worker Secrets |
| `GET /providers/gemini/v1/models` | Gemini model discovery using GEMINI_KEYS |
| `POST /providers/gemini/v1/chat/completions` | Gemini chat and optional SSE streaming |
| `POST /providers/gemini/v1beta/models/<model-id>:generateContent` | Gemini native image/PDF input and image generation |
| `POST /providers/gemini/v1beta/models/<model-id>:streamGenerateContent` | Gemini native image/PDF streaming |
| `POST /providers/groq/v1/chat/completions` | Groq chat and optional SSE streaming |
| `GET /providers/cerebras/v1/models` | Cerebras model discovery |
| `POST /providers/cerebras/v1/chat/completions` | Cerebras chat and optional SSE streaming |
| `GET /providers/deepseek/v1/models` | DeepSeek model discovery |
| `POST /providers/deepseek/v1/chat/completions` | DeepSeek chat and optional SSE streaming |
| `POST /` | Pasted code's `{prompt}`/`{content}` interface, returning `{answer, model, provider}` |

Express manages normal chat fallback and keeps the selected model explicit.
Only the legacy root endpoint has automatic fallback: Cerebras -> Groq ->
DeepSeek -> Cloudflare Llama 3B. Vision goes to Cloudflare Scout. With explicit
`model` (and `provider` for a vendor) the legacy endpoint does not change models.
The original Kimi label was incorrect: that endpoint called Llama 3B. Responses
now identify the real model ID.

Cloudflare uses the shared supported list in
`shared/src/constants/cloudflareModels.ts`; disabled models remain excluded.
Native Gemini requests have a 16,000,000-byte body ceiling for inline attachments;
other endpoints retain a 1,000,000-byte ceiling. Express's established vendor catalog is intersected with each vendor's live
model list. Non-chat vendor models are not added to the chat picker. Account
access, billing and model availability still apply. An unauthenticated root
GET returns a Ken AI page with HTTP 404; this is expected for an API address.

## Rebuild after editing

From the project root, run:

```powershell
npm.cmd --prefix worker run build:dashboard
npm.cmd --prefix worker run typecheck
npm.cmd --prefix worker test -- --run
```

`build:dashboard` performs a **dry run** and regenerates `worker/Ken-AI-Worker.js`.
It does not publish anything. For CLI deployment instead of dashboard pasting,
log into Cloudflare and run `npm.cmd --prefix worker run deploy`.

## Verification after deployment

1. Visit the Worker `/health` endpoint. HTTP 200 and `ok: true` confirms that
   `KEN_API_KEY` and `AI` are present, not that paid inference has been tested.
2. After restarting Express, check the provider/model picker. Missing or invalid
   vendor secrets make that provider's discovery unavailable rather than
   advertising its models as working.
3. Try a short selected-model chat, a streamed chat, a vision request and an
   image request to confirm actual account access. The local automated tests
   use mocked models/vendors and do not prove live production inference.

Official references: [Cloudflare AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/),
[Cloudflare Secrets](https://developers.cloudflare.com/workers/configuration/secrets/),
[Groq compatibility](https://console.groq.com/docs/openai),
[Cerebras chat](https://inference-docs.cerebras.ai/api-reference/chat-completions),
[DeepSeek models](https://api-docs.deepseek.com/api/list-models/).

The complete Render variable removal/retention checklist and deployment order
are in [docs/WORKER_RENDER_SETUP.md](../docs/WORKER_RENDER_SETUP.md).
