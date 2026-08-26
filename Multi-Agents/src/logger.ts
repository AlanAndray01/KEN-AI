/**
 * Console logging for long-running agent sessions.
 *
 * Agents stream for minutes at a time, so the log has to make it obvious which
 * agent is talking and what it is doing right now. Colours degrade gracefully
 * when `NO_COLOR` is set or the output is piped.
 */

import type { AgentRole, Severity } from './types.js';

const useColor = process.env['NO_COLOR'] === undefined && process.stdout.isTTY === true;

const codes = {
  reset: '\u001B[0m',
  bold: '\u001B[1m',
  dim: '\u001B[2m',
  red: '\u001B[31m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  blue: '\u001B[34m',
  magenta: '\u001B[35m',
  cyan: '\u001B[36m',
  gray: '\u001B[90m',
} as const;

type ColorName = keyof typeof codes;

function paint(text: string, ...names: ColorName[]): string {
  if (!useColor) return text;
  return `${names.map((name) => codes[name]).join('')}${text}${codes.reset}`;
}

const ROLE_COLORS: Record<AgentRole, ColorName> = {
  architect: 'magenta',
  security: 'red',
  backend: 'blue',
  frontend: 'cyan',
  qa: 'yellow',
  performance: 'green',
  docs: 'gray',
};

const SEVERITY_COLORS: Record<Severity, ColorName> = {
  critical: 'red',
  high: 'red',
  medium: 'yellow',
  low: 'blue',
  info: 'gray',
};

export function roleTag(role: AgentRole): string {
  return paint(`[${role}]`.padEnd(13), ROLE_COLORS[role], 'bold');
}

export function severityTag(severity: Severity): string {
  return paint(severity.toUpperCase().padEnd(8), SEVERITY_COLORS[severity], 'bold');
}

export const log = {
  banner(title: string, subtitle?: string): void {
    const line = '─'.repeat(Math.max(title.length + 4, 60));
    process.stdout.write(`\n${paint(line, 'gray')}\n`);
    process.stdout.write(`${paint(title, 'bold')}\n`);
    if (subtitle) process.stdout.write(`${paint(subtitle, 'dim')}\n`);
    process.stdout.write(`${paint(line, 'gray')}\n`);
  },

  step(message: string): void {
    process.stdout.write(`${paint('▸', 'cyan')} ${message}\n`);
  },

  info(message: string): void {
    process.stdout.write(`  ${message}\n`);
  },

  muted(message: string): void {
    process.stdout.write(`  ${paint(message, 'dim')}\n`);
  },

  success(message: string): void {
    process.stdout.write(`${paint('✓', 'green')} ${message}\n`);
  },

  warn(message: string): void {
    process.stdout.write(`${paint('!', 'yellow')} ${paint(message, 'yellow')}\n`);
  },

  error(message: string): void {
    process.stderr.write(`${paint('✗', 'red')} ${paint(message, 'red')}\n`);
  },

  /** A line emitted by a specific agent while it works. */
  agent(role: AgentRole, message: string): void {
    process.stdout.write(`${roleTag(role)} ${message}\n`);
  },

  /** A tool invocation by a specific agent — kept to one compact line. */
  tool(role: AgentRole, toolName: string, detail: string): void {
    const label = paint(toolName, 'bold');
    const target = detail ? ` ${paint(truncate(detail, 90), 'dim')}` : '';
    process.stdout.write(`${roleTag(role)} ${paint('⚙', 'gray')} ${label}${target}\n`);
  },
};

export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export function formatUsd(amount: number): string {
  return `$${amount.toFixed(4)}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}
