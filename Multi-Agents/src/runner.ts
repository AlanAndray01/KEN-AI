/**
 * The worker primitive: run one specialist agent to completion.
 *
 * `query()` from the Agent SDK returns an async generator of messages, not a
 * promise — the whole run is consumed by iterating it. Everything else here is
 * operational hardening around that loop: budget, timeout, live logging,
 * structured-output validation and retry on transient API failures.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { SPECIALISTS, buildSystemPrompt, toolsFor } from './agents.js';
import type { RuntimeConfig } from './config.js';
import { createGuard } from './guards.js';
import { formatDuration, formatUsd, log, truncate } from './logger.js';
import type { AgentReport, AgentRunResult, Finding, TaskSpec } from './types.js';

/**
 * The report contract, expressed as JSON Schema for the model and as a Zod
 * schema for us. The model is held to the first; nothing reaches the rest of the
 * system without passing the second.
 */
export const REPORT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'verdict', 'findings', 'filesChanged', 'followUps'],
  properties: {
    summary: { type: 'string' },
    verdict: { type: 'string', enum: ['pass', 'warn', 'fail'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['severity', 'title', 'detail'],
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          title: { type: 'string' },
          detail: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          recommendation: { type: 'string' },
        },
      },
    },
    filesChanged: { type: 'array', items: { type: 'string' } },
    followUps: { type: 'array', items: { type: 'string' } },
  },
};

const reportSchema = z.object({
  summary: z.string(),
  verdict: z.enum(['pass', 'warn', 'fail']),
  findings: z.array(
    z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      title: z.string(),
      detail: z.string(),
      file: z.string().optional(),
      line: z.number().optional(),
      recommendation: z.string().optional(),
    }),
  ),
  filesChanged: z.array(z.string()),
  followUps: z.array(z.string()),
});

function emptyReport(summary: string, verdict: AgentReport['verdict']): AgentReport {
  return { summary, verdict, findings: [], filesChanged: [], followUps: [] };
}

type ParsedReport = z.infer<typeof reportSchema>;

/**
 * Normalises the validated payload into our domain shape. Zod models an absent
 * optional as `T | undefined`, which `exactOptionalPropertyTypes` rejects, so
 * absent keys are dropped rather than carried through as explicit `undefined`.
 */
function toAgentReport(parsed: ParsedReport): AgentReport {
  return {
    summary: parsed.summary,
    verdict: parsed.verdict,
    filesChanged: parsed.filesChanged,
    followUps: parsed.followUps,
    findings: parsed.findings.map((finding): Finding => ({
      severity: finding.severity,
      title: finding.title,
      detail: finding.detail,
      ...(finding.file !== undefined ? { file: finding.file } : {}),
      ...(finding.line !== undefined ? { line: finding.line } : {}),
      ...(finding.recommendation !== undefined
        ? { recommendation: finding.recommendation }
        : {}),
    })),
  };
}

/** Short, human-readable description of what a tool call is about to do. */
function describeToolInput(toolName: string, input: unknown): string {
  if (typeof input !== 'object' || input === null) return '';
  const record = input as Record<string, unknown>;
  const pick = (key: string): string =>
    typeof record[key] === 'string' ? (record[key] as string) : '';

  switch (toolName) {
    case 'Read':
    case 'Write':
    case 'Edit':
      return pick('file_path');
    case 'Bash':
      return pick('command');
    case 'Grep':
      return `/${pick('pattern')}/ ${pick('path')}`.trim();
    case 'Glob':
      return `${pick('pattern')} ${pick('path')}`.trim();
    default:
      return '';
  }
}

interface ContentBlockish {
  type?: unknown;
  text?: unknown;
  name?: unknown;
  input?: unknown;
}

/** Errors worth a second attempt: transient API conditions, not logic failures. */
const RETRYABLE = new Set(['rate_limit', 'overloaded', 'server_error', 'unknown']);

function isRetryable(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    [...RETRYABLE].some((code) => lower.includes(code)) ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('socket hang up') ||
    lower.includes('529') ||
    lower.includes('503')
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

export interface RunContext {
  config: RuntimeConfig;
  /** Warnings raised during the run (blocked tools, missing tools, retries). */
  warnings: string[];
}

/** Runs a single task once. Retries are handled by `runAgent`. */
async function runOnce(task: TaskSpec, context: RunContext): Promise<AgentRunResult> {
  const { config } = context;
  const profile = SPECIALISTS[task.role];
  const allowWrite = config.allowWrite && profile.canMutate && task.mutating;
  const startedAt = Date.now();

  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, config.taskTimeoutMs);

  const blocked: string[] = [];
  let toolCalls = 0;
  let resultMessage: SDKResultMessage | null = null;
  let sessionId = '';
  let lastText = '';

  const options: Options = {
    cwd: config.repoRoot,
    model: config.model,
    effort: config.effort,
    maxTurns: task.maxTurns ?? config.maxTurns,
    maxBudgetUsd: task.maxBudgetUsd ?? config.taskBudgetUsd,
    abortController,
    // Isolation: a mission must not depend on whoever's machine it runs on, so
    // no user/project/local settings files are loaded. All context is explicit.
    settingSources: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: buildSystemPrompt(profile, allowWrite),
    },
    tools: toolsFor(profile, allowWrite),
    // Deliberately no `allowedTools`: every privileged call must reach the guard.
    permissionMode: 'default',
    canUseTool: createGuard({
      role: task.role,
      repoRoot: config.repoRoot,
      allowWrite,
      onDeny: (toolName, reason) => blocked.push(`${toolName}: ${reason}`),
    }),
    outputFormat: { type: 'json_schema', schema: REPORT_JSON_SCHEMA },
    env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'ken-ai-multi-agents/1.0.0' },
  };

  try {
    const stream = query({ prompt: task.prompt, options });

    for await (const message of stream as AsyncIterable<SDKMessage>) {
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
        const available = new Set(message.tools);
        const missing = (options.tools as string[]).filter((name) => !available.has(name));
        if (missing.length > 0) {
          context.warnings.push(
            `[${task.role}] requested tools not offered by the CLI: ${missing.join(', ')}`,
          );
        }
        continue;
      }

      if (message.type === 'assistant') {
        const blocks = (message.message.content ?? []) as ContentBlockish[];
        for (const block of blocks) {
          if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            lastText = block.text;
            log.agent(task.role, truncate(block.text, 160));
          } else if (block.type === 'tool_use' && typeof block.name === 'string') {
            toolCalls += 1;
            log.tool(task.role, block.name, describeToolInput(block.name, block.input));
          }
        }
        continue;
      }

      if (message.type === 'result') {
        resultMessage = message;
        sessionId = message.session_id;
      }
    }
  } catch (error) {
    clearTimeout(timeout);
    const aborted = abortController.signal.aborted;
    const detail = error instanceof Error ? error.message : String(error);
    const message = aborted
      ? `Timed out after ${formatDuration(config.taskTimeoutMs)}`
      : `Agent run failed: ${detail}`;
    return {
      task,
      ok: false,
      report: emptyReport(message, 'fail'),
      rawResult: lastText,
      durationMs: Date.now() - startedAt,
      costUsd: 0,
      numTurns: 0,
      toolCalls,
      sessionId,
      error: message,
    };
  }

  clearTimeout(timeout);
  const durationMs = Date.now() - startedAt;

  if (!resultMessage) {
    return {
      task,
      ok: false,
      report: emptyReport('The agent produced no result message.', 'fail'),
      rawResult: lastText,
      durationMs,
      costUsd: 0,
      numTurns: 0,
      toolCalls,
      sessionId,
      error: 'No result message received from the SDK.',
    };
  }

  const costUsd = resultMessage.total_cost_usd;
  const numTurns = resultMessage.num_turns;

  if (blocked.length > 0) {
    context.warnings.push(`[${task.role}] ${blocked.length} tool call(s) blocked by the guard`);
  }

  if (resultMessage.subtype !== 'success') {
    const reason =
      resultMessage.subtype === 'error_max_budget_usd'
        ? `Stopped at the ${formatUsd(task.maxBudgetUsd ?? config.taskBudgetUsd)} task budget`
        : resultMessage.subtype === 'error_max_turns'
          ? `Stopped at the ${task.maxTurns ?? config.maxTurns}-turn limit`
          : resultMessage.subtype === 'error_max_structured_output_retries'
            ? 'The agent could not produce a valid structured report'
            : `Execution error: ${resultMessage.errors.join('; ') || 'unknown'}`;
    return {
      task,
      ok: false,
      report: emptyReport(reason, 'fail'),
      rawResult: lastText,
      durationMs,
      costUsd,
      numTurns,
      toolCalls,
      sessionId,
      error: reason,
    };
  }

  const parsed = reportSchema.safeParse(resultMessage.structured_output);
  if (!parsed.success) {
    // The run itself succeeded; only the machine-readable envelope is missing,
    // so keep the prose rather than throwing the work away.
    context.warnings.push(
      `[${task.role}] structured output did not validate — falling back to the text result`,
    );
    return {
      task,
      ok: true,
      report: emptyReport(resultMessage.result || lastText, 'warn'),
      rawResult: resultMessage.result,
      durationMs,
      costUsd,
      numTurns,
      toolCalls,
      sessionId,
    };
  }

  return {
    task,
    ok: true,
    report: toAgentReport(parsed.data),
    rawResult: resultMessage.result,
    durationMs,
    costUsd,
    numTurns,
    toolCalls,
    sessionId,
  };
}

/**
 * Runs a task, retrying once on a transient API failure.
 */
export async function runAgent(task: TaskSpec, context: RunContext): Promise<AgentRunResult> {
  const profile = SPECIALISTS[task.role];
  const willWrite = context.config.allowWrite && profile.canMutate && task.mutating;
  log.agent(task.role, `▶ ${task.title} ${willWrite ? '(apply)' : '(read-only)'}`);

  let attempt = 0;
  let result = await runOnce(task, context);

  while (!result.ok && attempt < 1 && result.error && isRetryable(result.error)) {
    attempt += 1;
    const backoffMs = 5000 * attempt;
    context.warnings.push(`[${task.role}] transient failure, retrying in ${backoffMs / 1000}s`);
    log.warn(`${task.role}: ${result.error} — retrying in ${backoffMs / 1000}s`);
    await sleep(backoffMs);
    result = await runOnce(task, context);
  }

  const verdictLabel = result.ok ? result.report.verdict.toUpperCase() : 'FAILED';
  log.agent(
    task.role,
    `■ ${verdictLabel} · ${result.report.findings.length} finding(s) · ${formatDuration(result.durationMs)} · ${formatUsd(result.costUsd)}`,
  );
  return result;
}
