/**
 * Shared domain types for the KEN AI multi-agent system.
 *
 * The orchestrator, the workers and the reporters all speak in terms of these
 * shapes, so a change here is the single place that ripples out to every layer.
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Verdict = 'pass' | 'warn' | 'fail';

/** The specialist roles the orchestrator can delegate to. */
export type AgentRole =
  | 'architect'
  | 'security'
  | 'backend'
  | 'frontend'
  | 'qa'
  | 'performance'
  | 'docs';

export const AGENT_ROLES: readonly AgentRole[] = [
  'architect',
  'security',
  'backend',
  'frontend',
  'qa',
  'performance',
  'docs',
] as const;

export function isAgentRole(value: string): value is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(value);
}

/** One concrete problem an agent found in the codebase. */
export interface Finding {
  severity: Severity;
  title: string;
  detail: string;
  file?: string;
  line?: number;
  recommendation?: string;
}

/** A unit of work assigned to exactly one specialist agent. */
export interface TaskSpec {
  id: string;
  role: AgentRole;
  title: string;
  /** The instruction sent to the specialist as its user turn. */
  prompt: string;
  /**
   * Whether this task is allowed to modify files *when the mission runs in
   * apply mode*. Read-only tasks stay read-only even with `--apply`.
   */
  mutating: boolean;
  maxTurns?: number;
  maxBudgetUsd?: number;
}

/** The structured payload every specialist is required to return. */
export interface AgentReport {
  summary: string;
  verdict: Verdict;
  findings: Finding[];
  filesChanged: string[];
  followUps: string[];
}

/** Everything we know about one finished (or failed) agent run. */
export interface AgentRunResult {
  task: TaskSpec;
  ok: boolean;
  report: AgentReport;
  /** Raw final text from the agent, kept for the report appendix. */
  rawResult: string;
  durationMs: number;
  costUsd: number;
  numTurns: number;
  toolCalls: number;
  sessionId: string;
  /** Present when the run failed, timed out or blew its budget. */
  error?: string;
}

export interface CommandResult {
  command: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
  /** Tail of combined stdout/stderr — enough to diagnose, small enough to read. */
  output: string;
}

export interface VerificationResult {
  ok: boolean;
  checks: CommandResult[];
}

export interface MissionTotals {
  tasks: number;
  succeeded: number;
  failed: number;
  costUsd: number;
  durationMs: number;
  findingsBySeverity: Record<Severity, number>;
}

export interface MissionReport {
  mission: string;
  goal: string;
  mode: 'report-only' | 'apply';
  model: string;
  startedAt: string;
  finishedAt: string;
  plannedBy: 'planner-agent' | 'static-blueprint';
  results: AgentRunResult[];
  totals: MissionTotals;
  verification?: VerificationResult;
  executiveSummary?: string;
}
