# KEN AI — Multi-Agent System

An autonomous engineering swarm for this monorepo, built on
[`@anthropic-ai/claude-agent-sdk`](https://code.claude.com/docs/en/agent-sdk).

A **Main Orchestrator** breaks a goal into tasks, delegates them to
**specialist sub-agents** that read `client/`, `server/` and `shared/` in
parallel, and then lets the workspace's own `typecheck` / `lint` / `test`
scripts decide whether the repository is actually healthy.

---

## Quick start

```bash
# From the repository root — one-time setup
npm install
cp Multi-Agents/.env.example Multi-Agents/.env   # optional; see Credentials

# Read-only full audit (safe: no file is modified)
npm run agents:audit

# Or the exact command you already use
npx tsx Multi-Agents/run-agents.ts
```

Both write a Markdown report and a JSON dataset to `Multi-Agents/reports/`.

---

## Commands

Every command is available three ways — pick whichever you prefer:

| Via root script | Via workspace | Via the entry file |
| --- | --- | --- |
| `npm run agents:audit` | `npm run audit -w @Ken/multi-agents` | `npx tsx Multi-Agents/run-agents.ts run audit` |
| `npm run agents:verify` | `npm run verify -w @Ken/multi-agents` | `npx tsx Multi-Agents/run-agents.ts verify` |
| `npm run agents -- <args>` | `npm run agents -w @Ken/multi-agents -- <args>` | `npx tsx Multi-Agents/run-agents.ts <args>` |

```bash
npm run agents -- list                  # show missions and specialists
npm run agents -- run security          # one mission, read-only
npm run agents -- run security --apply  # let the agents fix what they find
npm run agents -- run custom --goal "Find every route missing an ownership check"
npm run agents -- verify                # typecheck + lint + test only, no API cost
npm run agents -- help
```

---

## Missions

| Mission | What it does | Specialists |
| --- | --- | --- |
| `audit` | Full-stack health check. The default. | all six |
| `security` | Auth, ownership, validation, rate limiting, CORS, secrets | security, backend |
| `ui` | React state bugs, accessibility, Tailwind consistency | frontend |
| `qa` | Runs the suites, then audits coverage of critical paths | qa, backend |
| `perf` | Query patterns, render cost, bundle weight, AI token spend | performance, backend |
| `docs` | Documentation and `.env.example` drift against real code | docs, architect |
| `custom` | Any goal you pass with `--goal`; the planner decomposes it | chosen by the planner |

## Specialists

| Role | Mandate | Shell | May apply fixes |
| --- | --- | --- | --- |
| `architect` | Layering, module boundaries, shared contracts | no | no |
| `security` | Exploitable defects in the Express server | no | yes |
| `backend` | Unhandled errors, SSE/streaming correctness, leaks | no | yes |
| `frontend` | React state, effects, a11y, Tailwind and layout | no | yes |
| `qa` | Runs typecheck/lint/test, then audits coverage | yes | yes |
| `performance` | DB queries, render cost, bundle, AI token spend | no | no |
| `docs` | Docs and env examples vs. what the code really does | no | yes |

`architect` and `performance` are permanently read-only: their findings are
structural, and a human should decide those.

---

## How a mission runs

```
                    ┌──────────────────────────┐
   goal ──────────► │  1. Planner (read-only)  │  surveys the repo, writes a plan
                    └────────────┬─────────────┘
                                 │  N disjoint tasks
             ┌───────────────────┼───────────────────┐
             ▼                   ▼                   ▼
      ┌────────────┐      ┌────────────┐      ┌────────────┐
      │ specialist │      │ specialist │      │ specialist │   2. Execute
      │  (own tool │      │  (own tool │      │  (own tool │      concurrently,
      │   surface) │      │   surface) │      │   surface) │      under budget
      └──────┬─────┘      └──────┬─────┘      └──────┬─────┘
             └───────────────────┼───────────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  3. Executive summary    │
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  4. typecheck/lint/test  │  the objective verdict
                    └────────────┬─────────────┘
                                 ▼
                  reports/<timestamp>-<mission>.{md,json}
```

Stages 1 and 3 are best-effort — if planning fails the mission falls back to the
static blueprint in `src/missions.ts`, and a missing summary never blocks the
report. The exit code is `0` only when every task succeeded **and**
verification passed, so this works directly as a CI gate.

---

## Safety model

Autonomous agents get exactly the access they need and nothing more.

- **Read-only by default.** Write tools are not even present unless you pass
  `--apply`. There is no flag that grants write access implicitly.
- **Per-role tool surfaces.** Only `qa` can run shell commands. Only roles
  marked "may apply fixes" ever receive `Edit`/`Write`.
- **Every privileged call is screened.** Dangerous tools are deliberately kept
  out of `allowedTools` so they must pass through `src/guards.ts`, which blocks:
  - any path outside the repository, and any `.env`, `*.pem`, `*.key`,
    `.dev-secrets.json` or `.npmrc` — read *or* write;
  - writes to `.git/`, `node_modules/`, `package-lock.json`, `uploads/`, CI config;
  - shell commands that delete, install, publish, push, fetch over the network,
    escalate privilege, or read a secrets file.
  Anything the guard does not recognise is denied, so a tool added by a future
  SDK version cannot silently widen scope.
- **Budgets and timeouts.** Per-task and per-mission USD ceilings plus a
  wall-clock timeout, all enforced by the SDK and the orchestrator. A mission
  cannot quietly run up a bill.
- **Reproducible context.** `settingSources: []` means no personal or machine
  settings are loaded — the agents' entire briefing lives in
  `src/project-context.ts`, mirrored from `.cursor/rules/`.

When running with `--apply`, commit or stash first. The agents are instructed to
make minimal changes and to leave anything risky in `followUps` instead, but the
reason the verification stage exists is that instructions are not guarantees.

---

## Credentials

The SDK resolves credentials in this order:

1. `ANTHROPIC_API_KEY` in `Multi-Agents/.env` or the environment;
2. the profile stored by `claude` / `ant auth login` on this machine.

If you already use Claude Code here, nothing further is needed — the startup
message telling you `ANTHROPIC_API_KEY` is not set is informational.

`Multi-Agents/.env` is covered by the repository's root `.gitignore`
(`.env`, `.env.*`). Never commit it.

---

## Configuration

CLI flags override `.env`, which overrides the defaults.

| Flag | `.env` key | Default | Meaning |
| --- | --- | --- | --- |
| `--apply` | `AGENTS_ALLOW_WRITE` | `false` | Allow file edits |
| `--model` | `AGENTS_MODEL` | `claude-opus-5` | Model id or alias |
| `--effort` | `AGENTS_EFFORT` | `high` | `low`…`max` |
| `--concurrency` | `AGENTS_CONCURRENCY` | `2` | Specialists in flight |
| `--task-budget` | `AGENTS_TASK_BUDGET_USD` | `2` | USD per specialist |
| `--budget` | `AGENTS_MISSION_BUDGET_USD` | `10` | USD per mission |
| `--timeout` | `AGENTS_TASK_TIMEOUT_SECONDS` | `900` | Seconds per specialist |
| `--no-plan` | — | planner on | Use the static blueprint |
| `--no-verify` | — | verify on | Skip typecheck/lint/test |
| `--dry-run` | — | off | Plan and print, dispatch nothing |

**Cost.** A single narrow specialist task on Opus costs roughly $0.30–$0.60. A
full six-specialist `audit` typically lands in the $2–$6 range. `--dry-run
--no-plan` costs nothing, and `verify` never calls the API. To trade depth for
cost, use `--model sonnet --effort medium`.

---

## Layout

```
Multi-Agents/
├── run-agents.ts           Entry point — npx tsx Multi-Agents/run-agents.ts
├── src/
│   ├── cli.ts              Argument parsing and commands
│   ├── orchestrator.ts     The four-stage mission pipeline
│   ├── planner.ts          Stage 1 — decomposes a goal into tasks
│   ├── runner.ts           Runs one specialist: budget, timeout, retry, parsing
│   ├── agents.ts           The specialist roster and their tool surfaces
│   ├── guards.ts           Permission screening for every privileged tool call
│   ├── missions.ts         Named missions and their static blueprints
│   ├── project-context.ts  The KEN AI house rules given to every agent
│   ├── verify.ts           Stage 4 — runs the workspace quality gates
│   ├── report.ts           Markdown + JSON report generation
│   ├── logger.ts           Console output
│   ├── config.ts           Env validation and runtime config
│   └── types.ts            Shared domain types
└── reports/                Generated. Git-ignored.
```

---

## Extending it

**Add a specialist** — add an entry to `SPECIALISTS` in `src/agents.ts` with its
mandate, scope, and whether it needs a shell or may write. Add the role to
`AgentRole` in `src/types.ts`. It is immediately available to the planner.

**Add a mission** — add an entry to `MISSIONS` in `src/missions.ts` with a goal,
the roles it may use, and a static blueprint for when planning is unavailable.

**Change the house rules** — edit `src/project-context.ts`. Those rules are
inlined rather than read from `.cursor/rules/` at runtime so that a mission is
reproducible and cannot be steered by an edit mid-run; keep the two in sync.
