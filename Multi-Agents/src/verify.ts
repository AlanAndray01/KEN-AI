/**
 * Objective verification.
 *
 * Agent reports are opinions until something compiles and the tests pass. This
 * module runs the workspace's own scripts and reports what really happened —
 * it is the gate that decides whether a mission left the repository healthy.
 */

import { spawn } from 'node:child_process';
import { formatDuration, log } from './logger.js';
import type { CommandResult, VerificationResult } from './types.js';

/** Keep the tail of the output: failures print last, and reports stay readable. */
const OUTPUT_TAIL_CHARS = 4000;

export interface VerificationCheck {
  label: string;
  command: string;
  args: string[];
}

/** The workspace's own quality gates, in increasing order of cost. */
export const DEFAULT_CHECKS: VerificationCheck[] = [
  { label: 'typecheck', command: 'npm', args: ['run', 'typecheck'] },
  { label: 'lint', command: 'npm', args: ['run', 'lint'] },
  { label: 'test', command: 'npm', args: ['run', 'test'] },
];

function runCommand(
  check: VerificationCheck,
  cwd: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const label = `${check.command} ${check.args.join(' ')}`;
    let output = '';
    let settled = false;

    // `shell: true` is required on Windows, where npm is a .cmd shim. The command
    // and arguments are constants defined above — never user or model input.
    const child = spawn(check.command, check.args, {
      cwd,
      shell: true,
      windowsHide: true,
      env: { ...process.env, CI: '1', FORCE_COLOR: '0' },
    });

    const capture = (chunk: Buffer): void => {
      output += chunk.toString();
      if (output.length > OUTPUT_TAIL_CHARS * 4) {
        output = output.slice(-OUTPUT_TAIL_CHARS * 2);
      }
    };

    child.stdout?.on('data', capture);
    child.stderr?.on('data', capture);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      resolve({
        command: label,
        ok: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: `${output.slice(-OUTPUT_TAIL_CHARS)}\n\n[timed out after ${formatDuration(timeoutMs)}]`,
      });
    }, timeoutMs);

    const finish = (code: number | null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command: label,
        ok: code === 0,
        exitCode: code,
        durationMs: Date.now() - startedAt,
        output: output.slice(-OUTPUT_TAIL_CHARS).trim(),
      });
    };

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command: label,
        ok: false,
        exitCode: null,
        durationMs: Date.now() - startedAt,
        output: `Failed to start: ${error.message}`,
      });
    });

    child.on('close', finish);
  });
}

/**
 * Runs each check in sequence. Every check runs even when an earlier one fails —
 * one report of the full state is more useful than a stop at the first error.
 */
export async function verifyWorkspace(
  cwd: string,
  checks: VerificationCheck[] = DEFAULT_CHECKS,
  timeoutMs = 600_000,
): Promise<VerificationResult> {
  const results: CommandResult[] = [];

  for (const check of checks) {
    log.step(`Verifying: ${check.label}`);
    const result = await runCommand(check, cwd, timeoutMs);
    results.push(result);
    if (result.ok) {
      log.success(`${check.label} passed (${formatDuration(result.durationMs)})`);
    } else {
      log.error(`${check.label} failed with exit code ${result.exitCode ?? 'none'}`);
      const tail = result.output.split('\n').slice(-12).join('\n');
      if (tail.trim()) log.muted(tail);
    }
  }

  return { ok: results.every((result) => result.ok), checks: results };
}
