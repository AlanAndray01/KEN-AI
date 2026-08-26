/**
 * The Main Orchestrator.
 *
 * Four stages, in order:
 *
 *   1. Plan      — a planner agent surveys the repo and decomposes the goal.
 *   2. Execute   — specialists run concurrently under a shared budget ceiling.
 *   3. Synthesise— one agent turns the raw findings into an executive summary.
 *   4. Verify    — the workspace's own typecheck/lint/test decide the verdict.
 *
 * Stages 1 and 3 are best-effort: if either fails the mission still completes,
 * because the value is in stages 2 and 4.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import type { RuntimeConfig } from './config.js';
import { formatDuration, formatUsd, log } from './logger.js';
import type { Mission } from './missions.js';
import { planMission } from './planner.js';
import { rankedFindings, summarise, writeReport } from './report.js';
import { runAgent } from './runner.js';
import type { RunContext } from './runner.js';
import { verifyWorkspace } from './verify.js';
import type { AgentRunResult, MissionReport, TaskSpec } from './types.js';

/**
 * Runs tasks with a bounded number in flight, stopping dispatch once the mission
 * budget is spent. Results come back in task order regardless of finish order.
 */
async function executeTasks(
  tasks: TaskSpec[],
  context: RunContext,
  spentSoFar: number,
): Promise<AgentRunResult[]> {
  const { config } = context;
  const results: AgentRunResult[] = new Array(tasks.length);
  let nextIndex = 0;
  let spent = spentSoFar;
  let budgetStopped = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      const task = tasks[index];
      if (!task) return;

      if (spent >= config.missionBudgetUsd) {
        if (!budgetStopped) {
          budgetStopped = true;
          log.warn(
            `Mission budget of ${formatUsd(config.missionBudgetUsd)} reached — remaining tasks skipped.`,
          );
        }
        const reason = `Skipped: mission budget of ${formatUsd(config.missionBudgetUsd)} was already spent.`;
        results[index] = {
          task,
          ok: false,
          report: { summary: reason, verdict: 'fail', findings: [], filesChanged: [], followUps: [] },
          rawResult: '',
          durationMs: 0,
          costUsd: 0,
          numTurns: 0,
          toolCalls: 0,
          sessionId: '',
          error: reason,
        };
        continue;
      }

      const result = await runAgent(task, context);
      spent += result.costUsd;
      results[index] = result;
    }
  };

  const lanes = Math.max(1, Math.min(config.concurrency, tasks.length));
  await Promise.all(Array.from({ length: lanes }, () => worker()));
  return results;
}

/** Turns the raw findings into a short brief for whoever reads the report. */
async function synthesise(
  mission: Mission,
  results: AgentRunResult[],
  config: RuntimeConfig,
): Promise<{ summary: string; costUsd: number } | null> {
  const findings = rankedFindings(results);
  if (findings.length === 0 && results.every((result) => result.ok)) {
    return {
      summary:
        'Every specialist completed and none reported an actionable finding. See the per-agent summaries below for what was covered.',
      costUsd: 0,
    };
  }

  const digest = results
    .map((result) => {
      const lines = result.report.findings.map(
        (finding) =>
          `  - [${finding.severity}] ${finding.title}${finding.file ? ` (${finding.file}${finding.line ? `:${finding.line}` : ''})` : ''}\n    ${finding.detail}`,
      );
      return [
        `## ${result.task.role} — ${result.task.title}`,
        `verdict: ${result.ok ? result.report.verdict : 'run failed'}`,
        result.report.summary,
        lines.length > 0 ? lines.join('\n') : '  (no findings)',
        result.report.followUps.length > 0
          ? `  follow-ups: ${result.report.followUps.join('; ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, 240_000);

  const options: Options = {
    cwd: config.repoRoot,
    model: config.model,
    effort: 'medium',
    maxTurns: 8,
    maxBudgetUsd: Math.min(config.taskBudgetUsd, 1),
    abortController,
    settingSources: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: `You are the Orchestrator writing the executive summary of a completed
multi-agent review of the KEN AI codebase (a MERN + TypeScript monorepo).

Write for a senior engineer deciding what to do this week. Plain Markdown, no
heading, 150-250 words:

- Open with the single most important thing found, stated concretely.
- Then what to fix first and why, in priority order. Group findings that share a
  root cause instead of listing them one by one.
- Note any area a specialist could not cover, or where a run failed.
- End with one sentence on overall health.

Use only the material below. Do not invent findings, do not restate every item,
and do not pad. If the findings are thin, say so plainly.

You may Read a file to confirm a detail, but you do not need to.`,
    },
    tools: ['Read'],
    permissionMode: 'default',
    canUseTool: async () => ({ behavior: 'allow' }),
    env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'ken-ai-multi-agents/1.0.0' },
  };

  const prompt = `Mission: ${mission.name}\nGoal: ${mission.goal}\n\nSpecialist reports:\n\n${digest}`;

  let result: SDKResultMessage | null = null;
  try {
    const stream = query({ prompt, options });
    for await (const message of stream as AsyncIterable<SDKMessage>) {
      if (message.type === 'result') result = message;
    }
  } catch (error) {
    clearTimeout(timeout);
    const detail = error instanceof Error ? error.message : String(error);
    log.warn(`Executive summary could not be generated (${detail}).`);
    return null;
  }

  clearTimeout(timeout);
  if (!result || result.subtype !== 'success' || !result.result.trim()) {
    log.warn('Executive summary could not be generated.');
    return null;
  }
  return { summary: result.result.trim(), costUsd: result.total_cost_usd };
}

export interface MissionOutcome {
  report: MissionReport;
  markdownPath: string;
  jsonPath: string;
  /** False when a task failed or verification did not pass. */
  healthy: boolean;
}

export async function runMission(
  mission: Mission,
  config: RuntimeConfig,
): Promise<MissionOutcome> {
  const startedAt = new Date();
  const context: RunContext = { config, warnings: [] };

  log.banner(
    `Mission: ${mission.name}`,
    `${mission.summary}  ·  ${config.allowWrite ? 'APPLY MODE — agents may edit files' : 'read-only'}  ·  model ${config.model}`,
  );

  // ---- Stage 1: plan -------------------------------------------------------
  let tasks = mission.blueprint;
  let plannedBy: MissionReport['plannedBy'] = 'static-blueprint';
  let plannerCost = 0;

  if (config.usePlanner) {
    log.step('Planning: surveying the repository and decomposing the goal…');
    const plan = await planMission(mission, config);
    if (plan) {
      tasks = plan.tasks;
      plannedBy = 'planner-agent';
      plannerCost = plan.costUsd;
      log.muted(plan.reasoning);
    }
  } else {
    log.step('Planning skipped — using the static blueprint.');
  }

  log.info('');
  tasks.forEach((task, index) => {
    const mode = config.allowWrite && task.mutating ? 'apply' : 'read-only';
    log.info(`${index + 1}. [${task.role}] ${task.title} (${mode})`);
  });
  log.info('');

  if (config.dryRun) {
    log.warn('Dry run — stopping before any specialist is dispatched.');
    const totals = summarise([], Date.now() - startedAt.getTime());
    const report: MissionReport = {
      mission: mission.name,
      goal: mission.goal,
      mode: config.allowWrite ? 'apply' : 'report-only',
      model: config.model,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      plannedBy,
      results: [],
      totals,
    };
    const written = await writeReport(report);
    return { report, ...written, healthy: true };
  }

  // ---- Stage 2: execute ----------------------------------------------------
  log.step(`Dispatching ${tasks.length} task(s), ${config.concurrency} at a time…`);
  const results = await executeTasks(tasks, context, plannerCost);

  // ---- Stage 3: synthesise -------------------------------------------------
  log.step('Synthesising the executive summary…');
  const synthesis = await synthesise(mission, results, config);

  // ---- Stage 4: verify -----------------------------------------------------
  let verification;
  if (config.runVerification) {
    log.step('Running the workspace quality gates…');
    verification = await verifyWorkspace(config.repoRoot);
  } else {
    log.step('Verification skipped by request.');
  }

  const totals = summarise(results, Date.now() - startedAt.getTime());
  totals.costUsd += plannerCost + (synthesis?.costUsd ?? 0);

  const report: MissionReport = {
    mission: mission.name,
    goal: mission.goal,
    mode: config.allowWrite ? 'apply' : 'report-only',
    model: config.model,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    plannedBy,
    results,
    totals,
    ...(verification ? { verification } : {}),
    ...(synthesis ? { executiveSummary: synthesis.summary } : {}),
  };

  const written = await writeReport(report);

  // ---- Wrap up -------------------------------------------------------------
  const findings = rankedFindings(results);
  log.banner('Mission complete');
  log.info(`Tasks       ${totals.succeeded}/${totals.tasks} succeeded`);
  log.info(
    `Findings    ${findings.length} ` +
      `(critical ${totals.findingsBySeverity.critical}, high ${totals.findingsBySeverity.high}, ` +
      `medium ${totals.findingsBySeverity.medium}, low ${totals.findingsBySeverity.low}, ` +
      `info ${totals.findingsBySeverity.info})`,
  );
  log.info(`Duration    ${formatDuration(totals.durationMs)}`);
  log.info(`Cost        ${formatUsd(totals.costUsd)} (estimated)`);
  if (verification) {
    log.info(`Verify      ${verification.ok ? 'PASS' : 'FAIL'}`);
  }
  log.info('');

  if (context.warnings.length > 0) {
    log.warn(`${context.warnings.length} warning(s) during the run:`);
    for (const warning of context.warnings) log.muted(warning);
    log.info('');
  }

  if (synthesis) {
    log.banner('Executive summary');
    process.stdout.write(`${synthesis.summary}\n\n`);
  }

  log.success(`Report:  ${written.markdownPath}`);
  log.success(`Data:    ${written.jsonPath}`);

  const healthy = totals.failed === 0 && (verification?.ok ?? true);
  return { report, ...written, healthy };
}
