/**
 * Mission blueprints.
 *
 * A mission is a named goal plus a static fallback plan. The planner agent
 * normally rewrites the plan for the codebase as it actually is today; the
 * blueprint is what runs when planning is disabled or when the planner fails,
 * so a mission is never a no-op.
 */

import { SPECIALISTS } from './agents.js';
import type { AgentRole, TaskSpec } from './types.js';

export interface Mission {
  name: string;
  summary: string;
  goal: string;
  /** Roles this mission may use. The planner is held to this set. */
  roles: AgentRole[];
  blueprint: TaskSpec[];
}

/** Builds a task and fills in the scope hint for its role. */
function task(
  id: string,
  role: AgentRole,
  title: string,
  instruction: string,
  mutating = true,
): TaskSpec {
  const scope = SPECIALISTS[role].scope.join(', ');
  return {
    id,
    role,
    title,
    mutating,
    prompt: `${instruction.trim()}\n\nStart in: ${scope}\n\nReturn the required JSON report when you are done.`,
  };
}

const SECURITY_TASK = task(
  'sec-audit',
  'security',
  'Audit middleware, routes and auth',
  `Audit the Express server's security posture.

Cover, with equal weight:
- \`server/src/middleware/\`: rate limiting, CORS allowlist, Helmet, input
  sanitisation, request id propagation, and the centralised error handler.
- \`server/src/routes/\`: which routes are protected, which are not, and whether
  that is correct for each one.
- \`server/src/controllers/\`: ownership checks on every resource lookup, Zod
  validation on every input, and what leaves the server in each response body.

Prove each finding by naming the request an attacker would send.`,
);

const BACKEND_TASK = task(
  'be-reliability',
  'backend',
  'Audit controllers and services for unhandled errors',
  `Audit backend reliability, starting with
\`server/src/controllers/chatController.ts\` — it carries the streaming path and
is the highest-risk file in the repository.

For that file specifically, trace every branch: provider error, malformed
provider chunk, client disconnect mid-stream, and an error thrown after the
response headers are already sent. Confirm the response is always ended and no
generator keeps running after the client goes away.

Then sweep the remaining controllers and \`server/src/services/\` for unhandled
promise rejections, empty catch blocks, missing awaits and leaked resources.`,
);

const FRONTEND_TASK = task(
  'fe-ui',
  'frontend',
  'Audit React components for state, a11y and Tailwind issues',
  `Audit \`client/src/components/\` and \`client/src/pages/\`.

Prioritise the chat surface — the composer, message list, markdown renderer and
code block — because that is where the state and layout bugs concentrate.

Report correctness defects first (effects, async state, boundary violations),
then accessibility gaps, then Tailwind and layout inconsistencies.`,
);

const QA_TASK = task(
  'qa-suites',
  'qa',
  'Run typecheck, lint and tests, then audit coverage',
  `Run the workspace suites from the repository root and report what actually
happens, then audit test coverage of the critical paths.

Do not summarise a failure you have not traced to its cause in the source.`,
);

const ARCHITECT_TASK = task(
  'arch-layering',
  'architect',
  'Audit layering and cross-workspace contracts',
  `Audit the boundaries between \`client/\`, \`server/\` and \`shared/\`.

Confirm React reaches the backend only through \`client/src/services\`, that no
vendor AI SDK or Mongoose import has leaked into the client, that provider calls
stay inside \`server/src/services/ai/providers/\`, and that the DTOs in
\`@Ken/shared\` still match both the code that produces and consumes them.`,
  false,
);

const PERF_TASK = task(
  'perf-cost',
  'performance',
  'Audit query patterns, render cost and token spend',
  `Audit performance and running cost across the stack: Mongoose query patterns
and indexes, AI token spend in the chat path, React render and re-render cost,
and anything eagerly bundled that a route could load lazily.

Quantify the impact of each finding.`,
  false,
);

const DOCS_TASK = task(
  'docs-drift',
  'docs',
  'Check documentation against the code',
  `Verify \`README.md\`, \`docs/\` and the \`.env.example\` files against what the
code actually reads and registers today. Report every drift you can pin to a line.`,
);

export const MISSIONS: Record<string, Mission> = {
  audit: {
    name: 'audit',
    summary: 'Full-stack health check across every specialist role.',
    goal: 'Assess the whole KEN AI codebase for defects, security holes, reliability risks, UI problems, missing tests, performance cost and documentation drift.',
    roles: ['architect', 'security', 'backend', 'frontend', 'qa', 'performance'],
    blueprint: [ARCHITECT_TASK, SECURITY_TASK, BACKEND_TASK, FRONTEND_TASK, QA_TASK, PERF_TASK],
  },

  security: {
    name: 'security',
    summary: 'Security and hardening pass over the Express server.',
    goal: 'Find and, in apply mode, fix exploitable security defects in the Express server: auth, ownership, validation, rate limiting, CORS, secrets and error handling.',
    roles: ['security', 'backend'],
    blueprint: [SECURITY_TASK, BACKEND_TASK],
  },

  ui: {
    name: 'ui',
    summary: 'React and Tailwind correctness, accessibility and layout pass.',
    goal: 'Find and, in apply mode, fix React state bugs, accessibility gaps and Tailwind layout inconsistencies in the client.',
    roles: ['frontend'],
    blueprint: [FRONTEND_TASK],
  },

  qa: {
    name: 'qa',
    summary: 'Run the suites and audit test coverage.',
    goal: 'Run typecheck, lint and tests, report every failure with its cause, and identify untested critical paths.',
    roles: ['qa', 'backend'],
    blueprint: [QA_TASK, BACKEND_TASK],
  },

  perf: {
    name: 'perf',
    summary: 'Performance and AI cost review.',
    goal: 'Identify database, rendering, bundle and AI-token costs that will hurt at production scale.',
    roles: ['performance', 'backend'],
    blueprint: [PERF_TASK, BACKEND_TASK],
  },

  docs: {
    name: 'docs',
    summary: 'Documentation and developer-experience accuracy check.',
    goal: 'Verify that the documentation, setup steps and env examples match the code.',
    roles: ['docs', 'architect'],
    blueprint: [DOCS_TASK, ARCHITECT_TASK],
  },
};

export function getMission(name: string): Mission | null {
  return MISSIONS[name] ?? null;
}

export function missionNames(): string[] {
  return Object.keys(MISSIONS);
}

/**
 * A free-form mission built from a goal supplied on the command line. The
 * planner decides which specialists to involve; the blueprint is a conservative
 * read-only sweep in case planning is unavailable.
 */
export function customMission(goal: string): Mission {
  return {
    name: 'custom',
    summary: 'User-supplied goal, decomposed by the planner agent.',
    goal,
    roles: ['architect', 'security', 'backend', 'frontend', 'qa', 'performance', 'docs'],
    blueprint: [
      task(
        'custom-1',
        'architect',
        'Investigate the requested goal',
        `Investigate and report on the following goal for the KEN AI codebase:\n\n${goal}`,
        false,
      ),
    ],
  };
}
