/**
 * Runtime configuration: environment parsing plus repository paths.
 *
 * Every value is validated with Zod at startup so a typo in `.env` fails loudly
 * here instead of halfway through a paid agent run.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** `Multi-Agents/` — this package's own root (ESM-safe, no `__dirname`). */
export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The monorepo root that the agents are pointed at. */
export const REPO_ROOT = path.resolve(PACKAGE_ROOT, '..');

export const REPORTS_DIR = path.join(PACKAGE_ROOT, 'reports');
export const LOGS_DIR = path.join(PACKAGE_ROOT, 'logs');

dotenv.config({ path: path.join(PACKAGE_ROOT, '.env'), quiet: true });

const booleanish = z
  .string()
  .transform((value) => ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase()));

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AGENTS_MODEL: z.string().min(1).default('claude-opus-5'),
  AGENTS_EFFORT: z.enum(['low', 'medium', 'high', 'xhigh', 'max']).default('high'),
  AGENTS_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  AGENTS_TASK_BUDGET_USD: z.coerce.number().positive().default(2),
  AGENTS_MISSION_BUDGET_USD: z.coerce.number().positive().default(10),
  AGENTS_TASK_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(900),
  AGENTS_MAX_TURNS: z.coerce.number().int().positive().default(40),
  AGENTS_ALLOW_WRITE: booleanish.default(false),
});

export type AgentsEnv = z.infer<typeof envSchema>;

function loadEnv(): AgentsEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid Multi-Agents configuration:\n${issues}`);
  }
  return parsed.data;
}

export const env: AgentsEnv = loadEnv();

/** Resolved settings for a single mission, after CLI flags are applied. */
export interface RuntimeConfig {
  model: string;
  effort: AgentsEnv['AGENTS_EFFORT'];
  concurrency: number;
  taskBudgetUsd: number;
  missionBudgetUsd: number;
  taskTimeoutMs: number;
  maxTurns: number;
  /** When false, no agent may create, edit or delete a file. */
  allowWrite: boolean;
  /** When true, plan and print but never call the API. */
  dryRun: boolean;
  /** When false, skip the planner agent and use the mission's static blueprint. */
  usePlanner: boolean;
  /** When false, skip the post-run typecheck/lint/test verification. */
  runVerification: boolean;
  repoRoot: string;
}

export function buildRuntimeConfig(overrides: Partial<RuntimeConfig> = {}): RuntimeConfig {
  const base: RuntimeConfig = {
    model: env.AGENTS_MODEL,
    effort: env.AGENTS_EFFORT,
    concurrency: env.AGENTS_CONCURRENCY,
    taskBudgetUsd: env.AGENTS_TASK_BUDGET_USD,
    missionBudgetUsd: env.AGENTS_MISSION_BUDGET_USD,
    taskTimeoutMs: env.AGENTS_TASK_TIMEOUT_SECONDS * 1000,
    maxTurns: env.AGENTS_MAX_TURNS,
    allowWrite: env.AGENTS_ALLOW_WRITE,
    dryRun: false,
    usePlanner: true,
    runVerification: true,
    repoRoot: REPO_ROOT,
  };
  return { ...base, ...overrides };
}

/**
 * The Agent SDK resolves credentials from `ANTHROPIC_API_KEY` *or* from a
 * stored `claude` / `ant auth login` profile, so a missing key is a warning
 * rather than a hard failure — we only fail once the SDK itself rejects auth.
 */
export function credentialHint(): string | null {
  if (env.ANTHROPIC_API_KEY) return null;
  return 'ANTHROPIC_API_KEY is not set — falling back to the credentials stored by `claude` / `ant auth login`.';
}

/** Guard against running the swarm against a directory that is not the monorepo. */
export function assertRepoLooksRight(): void {
  const marker = path.join(REPO_ROOT, 'package.json');
  if (!existsSync(marker)) {
    throw new Error(`Expected the monorepo root at ${REPO_ROOT}, but ${marker} does not exist.`);
  }
  for (const workspace of ['client', 'server', 'shared']) {
    if (!existsSync(path.join(REPO_ROOT, workspace))) {
      throw new Error(`Workspace "${workspace}/" is missing under ${REPO_ROOT}.`);
    }
  }
}
