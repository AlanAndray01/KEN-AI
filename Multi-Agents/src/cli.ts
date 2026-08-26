/**
 * Command-line entry point.
 *
 * Argument parsing is hand-rolled on purpose: the repo's dependency rule says
 * not to add a library where in-house code is clearly simpler, and this is a
 * dozen flags.
 */

import { pathToFileURL } from 'node:url';
import { assertRepoLooksRight, buildRuntimeConfig, credentialHint, REPO_ROOT } from './config.js';
import type { RuntimeConfig } from './config.js';
import { SPECIALISTS } from './agents.js';
import { formatDuration, log } from './logger.js';
import { customMission, getMission, MISSIONS, missionNames } from './missions.js';
import { runMission } from './orchestrator.js';
import { verifyWorkspace } from './verify.js';
import { AGENT_ROLES } from './types.js';

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Map<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string | boolean>();
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        flags.set(body.slice(0, eq), body.slice(eq + 1));
        continue;
      }
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags.set(body, next);
        index += 1;
      } else {
        flags.set(body, true);
      }
      continue;
    }
    positional.push(arg);
  }

  return { command: positional[0] ?? 'help', positional: positional.slice(1), flags };
}

function flagBool(flags: ParsedArgs['flags'], name: string): boolean {
  const value = flags.get(name);
  return value === true || value === 'true';
}

function flagNumber(flags: ParsedArgs['flags'], name: string): number | undefined {
  const value = flags.get(name);
  if (typeof value !== 'string') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function flagString(flags: ParsedArgs['flags'], name: string): string | undefined {
  const value = flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function configFromFlags(flags: ParsedArgs['flags']): RuntimeConfig {
  const overrides: Partial<RuntimeConfig> = {
    allowWrite: flagBool(flags, 'apply'),
    dryRun: flagBool(flags, 'dry-run'),
    usePlanner: !flagBool(flags, 'no-plan'),
    runVerification: !flagBool(flags, 'no-verify'),
  };

  const model = flagString(flags, 'model');
  if (model) overrides.model = model;

  const effort = flagString(flags, 'effort');
  if (effort && ['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) {
    overrides.effort = effort as RuntimeConfig['effort'];
  }

  const concurrency = flagNumber(flags, 'concurrency');
  if (concurrency !== undefined) overrides.concurrency = Math.max(1, Math.min(8, concurrency));

  const budget = flagNumber(flags, 'budget');
  if (budget !== undefined) overrides.missionBudgetUsd = budget;

  const taskBudget = flagNumber(flags, 'task-budget');
  if (taskBudget !== undefined) overrides.taskBudgetUsd = taskBudget;

  const timeout = flagNumber(flags, 'timeout');
  if (timeout !== undefined) overrides.taskTimeoutMs = timeout * 1000;

  return buildRuntimeConfig(overrides);
}

function printHelp(): void {
  const missions = Object.values(MISSIONS)
    .map((mission) => `    ${mission.name.padEnd(10)} ${mission.summary}`)
    .join('\n');

  const roles = AGENT_ROLES.map(
    (role) => `    ${role.padEnd(12)} ${SPECIALISTS[role].displayName}`,
  ).join('\n');

  process.stdout.write(`
KEN AI — Multi-Agent System

  A Main Orchestrator plans the work, specialist sub-agents execute it in
  parallel, and the workspace's own typecheck/lint/test decide the verdict.

USAGE

  npm run agents -w @Ken/multi-agents -- <command> [options]

COMMANDS

  run <mission>        Run a named mission (see below).
  run custom --goal "" Run a free-form goal; the planner decomposes it.
  verify               Run typecheck + lint + tests only. No API calls, no cost.
  list                 Show missions and specialists.
  help                 This message.

MISSIONS

${missions}

SPECIALISTS

${roles}

OPTIONS

  --apply              Let agents edit files. Default is read-only.
  --model <id>         Override the model (default from AGENTS_MODEL).
  --effort <level>     low | medium | high | xhigh | max.
  --concurrency <n>    Specialists in flight at once (1-8).
  --budget <usd>       Ceiling for the whole mission.
  --task-budget <usd>  Ceiling per specialist.
  --timeout <seconds>  Wall-clock limit per specialist.
  --no-plan            Skip the planner; use the mission's static blueprint.
  --no-verify          Skip the post-run typecheck/lint/test stage.
  --dry-run            Plan and print the task list, then stop. No specialists run.

EXAMPLES

  npm run agents -w @Ken/multi-agents -- run audit
  npm run agents -w @Ken/multi-agents -- run security --apply
  npm run agents -w @Ken/multi-agents -- run custom --goal "Find every route missing an ownership check"
  npm run agents -w @Ken/multi-agents -- verify

`);
}

function printList(): void {
  log.banner('Missions');
  for (const mission of Object.values(MISSIONS)) {
    log.step(mission.name);
    log.muted(mission.summary);
    log.muted(`roles: ${mission.roles.join(', ')}`);
  }
  log.banner('Specialists');
  for (const role of AGENT_ROLES) {
    const profile = SPECIALISTS[role];
    log.step(`${role} — ${profile.displayName}`);
    log.muted(profile.description);
    log.muted(
      `scope: ${profile.scope.join(', ')} · shell: ${profile.needsShell ? 'yes' : 'no'} · can apply fixes: ${profile.canMutate ? 'yes' : 'no'}`,
    );
  }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);

  if (command === 'help' || flagBool(flags, 'help')) {
    printHelp();
    return 0;
  }

  if (command === 'list') {
    printList();
    return 0;
  }

  assertRepoLooksRight();

  if (command === 'verify') {
    log.banner('Workspace verification', REPO_ROOT);
    const result = await verifyWorkspace(REPO_ROOT);
    log.info('');
    if (result.ok) {
      log.success('All quality gates passed.');
      return 0;
    }
    log.error('One or more quality gates failed.');
    return 1;
  }

  if (command !== 'run') {
    log.error(`Unknown command "${command}".`);
    printHelp();
    return 2;
  }

  const missionName = positional[0] ?? 'audit';
  const goal = flagString(flags, 'goal');

  const mission =
    missionName === 'custom'
      ? goal
        ? customMission(goal)
        : null
      : getMission(missionName);

  if (!mission) {
    if (missionName === 'custom') {
      log.error('The custom mission needs a goal: --goal "…"');
    } else {
      log.error(`Unknown mission "${missionName}". Available: ${missionNames().join(', ')}, custom`);
    }
    return 2;
  }

  const config = configFromFlags(flags);
  const hint = credentialHint();
  if (hint) log.muted(hint);

  if (config.allowWrite) {
    log.warn('APPLY MODE: specialists may edit files in this repository.');
    log.muted('Commit or stash your work first so the changes are easy to review and revert.');
  }

  const startedAt = Date.now();
  const outcome = await runMission(mission, config);
  log.muted(`Total wall clock: ${formatDuration(Date.now() - startedAt)}`);

  return outcome.healthy ? 0 : 1;
}

// Only self-execute when this file is the process entry point, so importing
// `main` from `run-agents.ts` does not start a second mission.
const entry = process.argv[1];
const isDirectRun = entry !== undefined && import.meta.url === pathToFileURL(entry).href;

if (isDirectRun) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      log.error(error instanceof Error ? error.message : String(error));
      if (error instanceof Error && error.stack) {
        log.muted(error.stack.split('\n').slice(1, 4).join('\n'));
      }
      process.exitCode = 1;
    });
}
