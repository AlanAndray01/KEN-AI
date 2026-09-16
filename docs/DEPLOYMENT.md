# Deploying KEN AI

Production topology:

| Piece | Host | Domain |
| --- | --- | --- |
| React client (Vite static build) | Vercel | `ken-ai.tech`, `www.ken-ai.tech` |
| Express API | Render | `api.ken-ai.tech` |
| Database | MongoDB Atlas | — |

The client and API are on different origins, so the auth cookies must be shared
across the domain. That is what `COOKIE_DOMAIN=.ken-ai.tech` does: the leading
dot scopes the cookie to every `ken-ai.tech` subdomain, and
`sessionCookieOptions()` in `server/src/services/auth/cookies.ts` switches to
`SameSite=None; Secure` automatically when `COOKIE_DOMAIN` is set.

Both halves must be on the **same registrable domain**. If the client stayed on
`*.vercel.app` while the API sat on `api.ken-ai.tech`, browsers would treat the
cookie as third-party and sign-in would silently fail in Safari and in Chrome's
third-party-cookie phase-out.

---

## 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. **Database Access** → add a user with a strong password.
3. **Network Access** → add `0.0.0.0/0`. Render's free tier has no static
   outbound IP, so an allowlist cannot be narrowed there.
4. Copy the `mongodb+srv://` connection string and append a database name, e.g.
   `...mongodb.net/ken-ai?retryWrites=true&w=majority`.

## 2. Generate the two secrets

Both must be long random values, and both are required or the server refuses to
boot in production:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"  # JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"  # ENCRYPTION_KEY
```

`ENCRYPTION_KEY` encrypts stored provider API keys. **Changing it later makes
every saved key undecryptable**, so set it once and keep a backup.

## 3. Render — the API

The repository contains `render.yaml`, so use **New → Blueprint** and point it at
the GitHub repo. Render reads the blueprint and prompts for the secrets marked
`sync: false`.

If creating the service manually instead, the settings are:

| Setting | Value |
| --- | --- |
| Root directory | *(leave blank — the repo root)* |
| Runtime | Node |
| Build command | `npm ci && npm run build -w @Ken/shared && npm run build -w @Ken/server` |
| Start command | `npm run start -w @Ken/server` |
| Health check path | `/api/health` |

The build must run from the repo root, not `server/`: the server imports
`@Ken/shared`, which is a workspace package that has to be compiled first.

Environment variables to set in the dashboard:

| Variable | Value | Required |
| --- | --- | --- |
| `MONGODB_URI` or `MONGO_URI` | Atlas connection string | **Yes** — no boot without it. `MONGO_URI` is accepted as an alias. |
| `JWT_SECRET` | generated above | **Yes** |
| `ENCRYPTION_KEY` | generated above | **Yes** |
| `GEMINI_API_KEY` | from [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | **Yes for default chat** |
| `GROQ_API_KEY` | from console.groq.com | Optional next hop |
| `NODE_ENV` | `production` | Yes (in blueprint) |
| `CLIENT_URL` | `https://ken-ai.tech,https://www.ken-ai.tech` | Yes (in blueprint) |
| `COOKIE_DOMAIN` | `.ken-ai.tech` | Yes (in blueprint) |
| `INITIAL_ADMIN_EMAIL` | the email you will register with | Recommended |
| `RESEND_API_KEY` | from resend.com | **Yes** — production will not boot without it |
| `EMAIL_FROM` or `RESEND_FROM_EMAIL` | verified sender, e.g. `Ken <noreply@ken-ai.tech>` | **Yes** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | only if using Google sign-in | Optional |

`CLIENT_URL` accepts a comma-separated list; `allowedClientOrigins()` in
`server/src/config/cors.ts` splits and trims it.

### Free-tier cold starts

Render's free plan sleeps a service after ~15 minutes of inactivity, and the
next request waits ~50 seconds for a cold boot. Chat streaming will look broken
to the first visitor after an idle period. Upgrade to the paid Starter plan
before showing the app to real users.

## 4. Vercel — the client

The repository contains `vercel.json`. Import the repo and **leave the Root
Directory as the repository root** — do not set it to `client/`, or the
`@Ken/shared` workspace dependency will not resolve.

`vercel.json` already sets the build command, `client/dist` as the output
directory, and the SPA rewrite that makes deep links like `/settings/account`
work on refresh.

One environment variable, for the Production environment:

```
VITE_API_BASE_URL = https://api.ken-ai.tech/api
```

`VITE_API_URL` is accepted as an alias. Do not set either to `localhost` on
Vercel — the production client build refuses that fallback.

The trailing `/api` matters — `API_BASE_URL` in `client/src/services/api.ts` is
used as a prefix for paths like `/auth/login`. Login, signup, Google start, and
chat all call `https://api.ken-ai.tech/api/...` directly. Do not send auth to
`https://ken-ai.tech/api/...`: Vercel has no Express app, and the SPA rewrite
in `vercel.json` turns those POSTs into `405` + `index.html`. Vite inlines
`VITE_*` variables at build time, so changing it requires a redeploy, not just
a restart.

Email signup and password reset require `RESEND_API_KEY` and a verified From
address (`EMAIL_FROM` or `RESEND_FROM_EMAIL`) on Render. Production will not
boot without them. A Resend delivery failure returns `503 EMAIL_UNAVAILABLE`.

### Editing vercel.json

`vercel.json` is validated against a strict JSON Schema that sets
`additionalProperties: false`, so **any key Vercel does not define fails the
build** — including a key added purely to hold a comment. JSON has no comment
syntax and Vercel provides no escape hatch, so notes about the configuration go
here in this file, not in `vercel.json`. The one exception Vercel accepts is
`$schema`, which editors use for autocompletion.

To check a change before pushing:

```bash
curl -s https://openapi.vercel.sh/vercel.json -o /tmp/vercel-schema.json
node -e "const s=require('/tmp/vercel-schema.json'),c=require('./vercel.json');
for (const k of Object.keys(c)) if (k!=='\$schema' && !s.properties[k]) console.log('INVALID:',k)"
```

### Why the rewrite names the SEO files

The SPA rewrite sends unmatched paths to `index.html`. Vercel checks the
filesystem first, so the files in `client/public/` are served on their own and
the exclusions in the rewrite's negative lookahead are belt and braces.

They are named anyway because of how this failed the first time: before
`client/public/robots.txt` existed, `/robots.txt` fell through to the rewrite
and returned `index.html` with **HTTP 200** and `Content-Type: text/html`.
Crawlers read markup where directives belong, and nothing anywhere reported an
error — a 404 would have been obvious, a wrong-typed 200 was silent. Listing the
files means a build that drops one breaks loudly instead of quietly serving HTML
to Googlebot again. `client/src/seo.test.ts` guards the same ground.

## 5. DNS for ken-ai.tech

At your registrar, point the records at the two hosts:

| Record | Name | Target | Purpose |
| --- | --- | --- | --- |
| `A` | `@` | `76.76.21.21` | apex → Vercel |
| `CNAME` | `www` | `cname.vercel-dns.com` | www → Vercel |
| `CNAME` | `api` | `<your-service>.onrender.com` | api → Render |

Then:

- **Vercel** → Project → Settings → Domains → add `ken-ai.tech` and
  `www.ken-ai.tech`.
- **Render** → Service → Settings → Custom Domain → add `api.ken-ai.tech`.

Confirm Vercel's current apex IP when you add the domain; it displays the exact
record to create. Both hosts issue Let's Encrypt certificates automatically once
DNS resolves, which usually takes minutes but can take up to an hour.

## 6. Google OAuth (only if used)

In Google Cloud Console → Credentials → your OAuth client:

- Authorised JavaScript origins: `https://ken-ai.tech` and `https://www.ken-ai.tech`
- Authorised redirect URI: `https://api.ken-ai.tech/api/auth/google/callback`

This must match `GOOGLE_CALLBACK_URL` on Render exactly, including the scheme.

## 7. Verify the deployment

```bash
curl https://api.ken-ai.tech/api/health          # expect 200 with database: connected
curl -I https://ken-ai.tech                      # expect 200 and a Vercel header
```

Then in the browser: register an account, confirm the verification email
arrives, sign in, send a chat message, and confirm the reply streams in. Finally
open **Settings → Data controls** and check that the delete-account section
renders — that path exercises cookies, CORS, and the API together.

## Deployment order

Deploy Render first. The client needs `VITE_API_BASE_URL` baked in at build
time, so the API URL has to exist before the Vercel build runs.
