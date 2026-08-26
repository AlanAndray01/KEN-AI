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
| `MONGODB_URI` | Atlas connection string | **Yes** — no boot without it |
| `JWT_SECRET` | generated above | **Yes** |
| `ENCRYPTION_KEY` | generated above | **Yes** |
| `GROQ_API_KEY` | from console.groq.com | **Yes for chat** |
| `NODE_ENV` | `production` | Yes (in blueprint) |
| `CLIENT_URL` | `https://ken-ai.tech,https://www.ken-ai.tech` | Yes (in blueprint) |
| `COOKIE_DOMAIN` | `.ken-ai.tech` | Yes (in blueprint) |
| `INITIAL_ADMIN_EMAIL` | the email you will register with | Recommended |
| `RESEND_API_KEY` | for signup verification + password reset | Recommended |
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

The trailing `/api` matters — `API_BASE_URL` in `client/src/services/api.ts` is
used as a prefix for paths like `/auth/login`. Vite inlines `VITE_*` variables
at build time, so changing it requires a redeploy, not just a restart.

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

- Authorised JavaScript origin: `https://ken-ai.tech`
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
