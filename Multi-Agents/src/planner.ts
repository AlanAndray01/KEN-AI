/**
 * The planning stage of the orchestrator.
 *
 * A planner agent surveys the repository read-only and decomposes the mission
 * goal into concrete tasks for the specialists. This is what makes the system
 * adaptive rather than a fixed script: the plan reflects the code as it is now.
 *
 * Planning is best-effort by design. If it fails, times out or returns nothing
 * usable, the caller falls back to the mission's static blueprint.
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options, SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { SPECIALISTS } from './agents.js';
import type { RuntimeConfig } from './config.js';
import { checkPath } from './guards.js';
import { PROJECT_BRIEF } from './project-context.js';
import { formatUsd, log, truncate } from './logger.js';
import type { Mission } from './missions.js';
import { AGENT_ROLES, isAgentRole } from './types.js';
import type { TaskSpec } from './types.js';

const MAX_TASKS = 8;

const planSchema = z.object({
  reasoning: z.string(),
  tasks: z
    .array(
      z.object({
        role: z.string(),
        title: z.string(),
        instruction: z.string(),
        mutating: z.boolean(),
      }),
    )
    .max(MAX_TASKS),
});

function planJsonSchema(roles: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reasoning', 'tasks'],
    properties: {
      reasoning: { type: 'string' },
      tasks: {
        type: 'array',
        maxItems: MAX_TASKS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['role', 'title', 'instruction', 'mutating'],
          properties: {
            role: { type: 'string', enum: [...roles] },
            title: { type: 'string' },
            instruction: { type: 'string' },
            mutating: { type: 'boolean' },
          },
        },
      },
    },
  };
}

function plannerSystemPrompt(mission: Mission): string {
  const roster = mission.roles
    .map((role) => `- \`${role}\` — ${SPECIALISTS[role].description}`)
    .join('\n');

  return `${PROJECT_BRIEF}

# Your role: Orchestrator / Planner

You do not fix anything. You survey the repository and produce the work plan
that the specialist agents will execute in parallel.

## Available specialists

${roster}

## Method

1. Survey before planning. Use Glob and Grep to see what actually exists — the
   real route files, the real controllers, the real components. Read the two or
   three files most central to the goal. Do not plan against an imagined layout.
2. Produce between 2 and ${MAX_TASKS} tasks. Fewer, sharper tasks beat many vague ones.
3. Give each task to exactly one specialist, and make the tasks disjoint: two
   agents auditing the same file is wasted budget. Split by area, not by phase.
4. Write each \`instruction\` as a direct order to that specialist. Name the
   concrete files and directories you found in step 1. State what to look for and
   what "done" means. A specialist receives only its own instruction — it cannot
   see this plan, the mission, or the other tasks, so each instruction must stand
   completely on its own.
5. Set \`mutating\` to true only for tasks where a careful, narrow code fix is a
   sensible outcome. Set it to false for pure investigation, and for anything
   touching architecture or a shared contract, where a human should decide.
6. \`reasoning\`: two or three sentences on how you split the work and why.

Plan for the goal you are given. Do not widen it.`;
}

export interface PlanResult {
  tasks: TaskSpec[];
  reasoning: string;
  costUsd: number;
}

/**
 * Asks the planner agent to decompose the mission. Returns `null` when planning
 * did not produce a usable plan, so the caller can fall back to the blueprint.
 */
export async function planMission(
  mission: Mission,
  config: RuntimeConfig,
): Promise<PlanResult | null> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, Math.min(config.taskTimeoutMs, 300_000));

  const options: Options = {
    cwd: config.repoRoot,
    model: config.model,
    effort: config.effort,
    maxTurns: 30,
    maxBudgetUsd: Math.min(config.taskBudgetUsd, 1.5),
    abortController,
    settingSources: [],
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: plannerSystemPrompt(mission),
    },
    // The planner never writes and never runs commands.
    tools: ['Read', 'Grep', 'Glob'],
    permissionMode: 'default',
    canUseTool: async (toolName, input) => {
      if (toolName === 'Grep' || toolName === 'Glob') return { behavior: 'allow' };
      if (toolName === 'Read') {
        const target = input['file_path'];
        if (typeof target === 'string') {
          const problem = checkPath(target, config.repoRoot, 'read');
          if (problem) return { behavior: 'deny', message: problem };
        }
        return { behavior: 'allow' };
      }
      return { behavior: 'deny', message: 'The planner may only read and search.' };
    },
    outputFormat: { type: 'json_schema', schema: planJsonSchema(mission.roles) },
    env: { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: 'ken-ai-multi-agents/1.0.0' },
  };

  const prompt = `Mission: ${mission.name}

Goal:
${mission.goal}

Survey the repository at ${config.repoRoot} and produce the work plan.`;

  let result: SDKResultMessage | null = null;

  try {
    const stream = query({ prompt, options });
    for await (const message of stream as AsyncIterable<SDKMessage>) {
      if (message.type === 'assistant') {
        for (const block of message.message.content ?? []) {
          if (block.type === 'text' && block.text.trim()) {
            log.muted(`planner: ${truncate(block.text, 140)}`);
          } else if (block.type === 'tool_use') {
            log.muted(`planner: ⚙ ${block.name}`);
          }
        }
      } else if (message.type === 'result') {
        result = message;
      }
    }
  } catch (error) {
    clearTimeout(timeout);
    const detail = error instanceof Error ? error.message : String(error);
    log.warn(`Planning failed (${detail}). Falling back to the static blueprint.`);
    return null;
  }

  clearTimeout(timeout);

  if (!result || result.subtype !== 'success') {
    log.warn('Planner produced no usable plan. Falling back to the static blueprint.');
    return null;
  }

  const parsed = planSchema.safeParse(result.structured_output);
  if (!parsed.success) {
    log.warn('Planner output did not validate. Falling back to the static blueprint.');
    return null;
  }

  const allowedRoles = new Set<string>(mission.roles);
  const tasks: TaskSpec[] = [];

  parsed.data.tasks.forEach((entry, index) => {
    if (!isAgentRole(entry.role) || !allowedRoles.has(entry.role)) {
      log.warn(`Planner proposed an out-of-scope role "${entry.role}" — dropping that task.`);
      return;
    }
    const profile = SPECIALISTS[entry.role];
    tasks.push({
      id: `plan-${index + 1}-${entry.role}`,
      role: entry.role,
      title: entry.title,
      // A role that is never allowed to mutate stays read-only whatever the plan says.
      mutating: entry.mutating && profile.canMutate,
      prompt: `${entry.instruction.trim()}\n\nReturn the required JSON report when you are done.`,
    });
  });

  if (tasks.length === 0) {
    log.warn('Planner returned no valid tasks. Falling back to the static blueprint.');
    return null;
  }

  log.success(
    `Planner produced ${tasks.length} task(s) for ${new Set(tasks.map((t) => t.role)).size} specialist(s) · ${formatUsd(result.total_cost_usd)}`,
  );

  return {
    tasks,
    reasoning: parsed.data.reasoning,
    costUsd: result.total_cost_usd,
  };
}

/** The roles the planner is allowed to name, for schema construction. */
export const ALL_ROLE_NAMES: readonly string[] = AGENT_ROLES;
