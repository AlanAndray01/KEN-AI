/**
 * The permission guard.
 *
 * Every tool call that needs approval is routed through here before it runs.
 * This is the layer that makes an unattended agent run safe to leave alone: the
 * model can ask for anything, but only the operations below actually execute.
 *
 * Design note: dangerous tools are deliberately kept out of `allowedTools`, so
 * they always reach this function instead of being auto-approved by the SDK.
 */

import path from 'node:path';
import type { CanUseTool, PermissionResult } from '@anthropic-ai/claude-agent-sdk';
import { log } from './logger.js';
import type { AgentRole } from './types.js';

/**
 * Committed template files that look like secrets but hold none. The `docs`
 * agent's job is to check these against the code, so they must stay readable.
 */
const SECRET_EXCEPTIONS: RegExp[] = [/(^|[\\/])\.env\.(example|sample|template)$/i];

/** Files that may never be read or written, no matter who asks. */
const SECRET_PATTERNS: RegExp[] = [
  /(^|[\\/])\.env($|\.)/i,
  /(^|[\\/])\.dev-secrets\.json$/i,
  /\.(pem|key|p12|pfx|keystore)$/i,
  /(^|[\\/])id_rsa(\.pub)?$/i,
  /(^|[\\/])\.npmrc$/i,
];

/** Paths that may be read but never written. */
const WRITE_PROTECTED_PATTERNS: RegExp[] = [
  /(^|[\\/])\.git([\\/]|$)/i,
  /(^|[\\/])node_modules([\\/]|$)/i,
  /(^|[\\/])package-lock\.json$/i,
  /(^|[\\/])uploads([\\/]|$)/i,
  /(^|[\\/])\.github([\\/]|workflows[\\/])/i,
  /(^|[\\/])Multi-Agents[\\/]reports([\\/]|$)/i,
];

/**
 * Shell commands that are refused outright. The agents legitimately need to run
 * the test suites, so the guard blocks by capability rather than banning Bash.
 */
const FORBIDDEN_COMMAND_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /\brm\s+(-[a-z]*\s+)*-[a-z]*[rf]/i, why: 'recursive or forced delete' },
  { pattern: /\b(rmdir|del|Remove-Item)\b/i, why: 'delete command' },
  { pattern: /\bgit\s+(push|reset\s+--hard|clean|checkout\s+--|restore|rebase|commit|revert)\b/i, why: 'mutating git command' },
  { pattern: /\bnpm\s+(publish|install|i|uninstall|remove|add|update|ci|link)\b/i, why: 'dependency or registry mutation' },
  { pattern: /\b(pnpm|yarn|bun)\s+(add|remove|install|publish|up)\b/i, why: 'dependency mutation' },
  { pattern: /\b(curl|wget|Invoke-WebRequest|iwr)\b/i, why: 'network fetch' },
  { pattern: /\b(sudo|runas|chmod\s+777|icacls)\b/i, why: 'privilege or ACL change' },
  { pattern: /\b(shutdown|reboot|taskkill|Stop-Computer|mkfs|format)\b/i, why: 'system-level command' },
  { pattern: />\s*\/dev\/sd|dd\s+if=/i, why: 'raw device write' },
  { pattern: /\bmongo(sh|dump|restore)?\b.*\b(drop|remove)\b/i, why: 'destructive database command' },
  {
    // `.env.example` and friends are committed templates, so they stay readable.
    pattern: /\b(cat|type|Get-Content|less|more|head|tail)\b[^|;&]*\.env\b(?!\.(example|sample|template))/i,
    why: 'reading a secrets file',
  },
  { pattern: /\bnpx?\s+.*\bclaude\b/i, why: 'recursive agent invocation' },
];

/** Tool names that write to the filesystem. */
const MUTATING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);

/**
 * Tools that cannot reach the filesystem or the network, so they need no
 * screening. `StructuredOutput` is the harness's own tool for returning the
 * final JSON report — blocking it would break every run.
 */
const HARMLESS_TOOLS = new Set([
  'Grep',
  'Glob',
  'TodoWrite',
  'StructuredOutput',
  'ExitPlanMode',
]);

export interface GuardOptions {
  role: AgentRole;
  repoRoot: string;
  allowWrite: boolean;
  /** Called for every denial, so the mission report can show what was blocked. */
  onDeny?: (toolName: string, reason: string) => void;
}

function deny(reason: string): PermissionResult {
  return { behavior: 'deny', message: reason };
}

const ALLOW: PermissionResult = { behavior: 'allow' };

function firstString(input: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

/** Resolves a tool-supplied path against the repo root without escaping it. */
export function checkPath(
  target: string,
  repoRoot: string,
  intent: 'read' | 'write',
): string | null {
  const resolved = path.resolve(repoRoot, target);
  const relative = path.relative(repoRoot, resolved);

  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return `Path escapes the repository: ${resolved}`;
  }
  const isTemplate = SECRET_EXCEPTIONS.some((pattern) => pattern.test(relative));
  if (!isTemplate && SECRET_PATTERNS.some((pattern) => pattern.test(relative))) {
    return `Blocked: ${relative} may hold credentials, and agents never touch secret files.`;
  }
  if (intent === 'write' && WRITE_PROTECTED_PATTERNS.some((pattern) => pattern.test(relative))) {
    return `Blocked: ${relative} is write-protected (VCS, dependencies, lockfile, uploads or CI config).`;
  }
  return null;
}

/** Screens a shell command for anything destructive or out of scope. */
export function checkCommand(command: string): string | null {
  for (const { pattern, why } of FORBIDDEN_COMMAND_PATTERNS) {
    if (pattern.test(command)) {
      return `Blocked (${why}): this run only permits read-only and test commands.`;
    }
  }
  return null;
}

/**
 * Builds the `canUseTool` handler for one agent run.
 */
export function createGuard(options: GuardOptions): CanUseTool {
  const { role, repoRoot, allowWrite, onDeny } = options;

  const refuse = (toolName: string, reason: string): PermissionResult => {
    log.agent(role, `⛔ ${toolName} denied — ${reason}`);
    onDeny?.(toolName, reason);
    return deny(reason);
  };

  return async (toolName, input) => {
    if (MUTATING_TOOLS.has(toolName)) {
      if (!allowWrite) {
        return refuse(
          toolName,
          'This mission is read-only. Report the fix in your findings instead of applying it.',
        );
      }
      const target = firstString(input, ['file_path', 'path', 'notebook_path']);
      if (!target) return refuse(toolName, 'No file path supplied.');
      const problem = checkPath(target, repoRoot, 'write');
      if (problem) return refuse(toolName, problem);
      return ALLOW;
    }

    if (toolName === 'Bash') {
      const command = firstString(input, ['command']);
      if (!command) return refuse(toolName, 'No command supplied.');
      const problem = checkCommand(command);
      if (problem) return refuse(toolName, problem);
      return ALLOW;
    }

    if (toolName === 'Read') {
      const target = firstString(input, ['file_path', 'path']);
      if (target) {
        const problem = checkPath(target, repoRoot, 'read');
        if (problem) return refuse(toolName, problem);
      }
      return ALLOW;
    }

    // Search, planning and the harness's own structured-output tool cannot touch
    // the filesystem, so they need no screening. Anything unrecognised is refused,
    // so a tool added by a future SDK version cannot silently widen scope.
    if (HARMLESS_TOOLS.has(toolName)) {
      return ALLOW;
    }

    return refuse(toolName, `Tool "${toolName}" is not part of this agent's mandate.`);
  };
}
