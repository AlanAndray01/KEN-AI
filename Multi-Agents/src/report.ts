/**
 * Mission reporting.
 *
 * Two artefacts are written for every mission: a Markdown report for a human to
 * read, and the same data as JSON so it can be diffed between runs or consumed
 * by CI. The report is assembled deterministically from validated data — no
 * model is involved in producing it, so it never drifts from what actually ran.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { REPORTS_DIR } from './config.js';
import { SPECIALISTS } from './agents.js';
import { formatDuration, formatUsd } from './logger.js';
import type {
  AgentRunResult,
  Finding,
  MissionReport,
  MissionTotals,
  Severity,
  VerificationResult,
} from './types.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function emptySeverityCounts(): Record<Severity, number> {
  return { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
}

export function summarise(results: AgentRunResult[], durationMs: number): MissionTotals {
  const findingsBySeverity = emptySeverityCounts();
  for (const result of results) {
    for (const finding of result.report.findings) {
      findingsBySeverity[finding.severity] += 1;
    }
  }
  return {
    tasks: results.length,
    succeeded: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
    costUsd: results.reduce((total, result) => total + result.costUsd, 0),
    durationMs,
    findingsBySeverity,
  };
}

/** All findings across all agents, most severe first. */
export function rankedFindings(
  results: AgentRunResult[],
): { finding: Finding; from: AgentRunResult }[] {
  return results
    .flatMap((result) => result.report.findings.map((finding) => ({ finding, from: result })))
    .sort(
      (a, b) =>
        SEVERITY_ORDER.indexOf(a.finding.severity) - SEVERITY_ORDER.indexOf(b.finding.severity),
    );
}

function location(finding: Finding): string {
  if (!finding.file) return '';
  return finding.line ? `\`${finding.file}:${finding.line}\`` : `\`${finding.file}\``;
}

function verificationSection(verification: VerificationResult): string {
  const rows = verification.checks
    .map(
      (check) =>
        `| \`${check.command}\` | ${check.ok ? 'pass' : 'FAIL'} | ${check.exitCode ?? 'n/a'} | ${formatDuration(check.durationMs)} |`,
    )
    .join('\n');

  const failures = verification.checks
    .filter((check) => !check.ok)
    .map(
      (check) =>
        `<details>\n<summary>Output — <code>${check.command}</code></summary>\n\n\`\`\`\n${check.output || '(no output captured)'}\n\`\`\`\n\n</details>`,
    )
    .join('\n\n');

  return [
    '## Verification',
    '',
    `Overall: **${verification.ok ? 'PASS' : 'FAIL'}**`,
    '',
    '| Command | Result | Exit code | Duration |',
    '| --- | --- | --- | --- |',
    rows,
    failures ? `\n${failures}` : '',
  ].join('\n');
}

export function renderMarkdown(report: MissionReport): string {
  const { totals } = report;
  const findings = rankedFindings(report.results);
  const severityRow = SEVERITY_ORDER.map(
    (severity) => `${severity}: ${totals.findingsBySeverity[severity]}`,
  ).join(' · ');

  const lines: string[] = [
    `# Mission report — \`${report.mission}\``,
    '',
    `> ${report.goal}`,
    '',
    '| | |',
    '| --- | --- |',
    `| Mode | **${report.mode}** |`,
    `| Model | \`${report.model}\` |`,
    `| Planned by | ${report.plannedBy} |`,
    `| Started | ${report.startedAt} |`,
    `| Duration | ${formatDuration(totals.durationMs)} |`,
    `| Estimated cost | ${formatUsd(totals.costUsd)} |`,
    `| Tasks | ${totals.succeeded}/${totals.tasks} succeeded |`,
    `| Findings | ${findings.length} (${severityRow}) |`,
    '',
  ];

  if (report.executiveSummary) {
    lines.push('## Executive summary', '', report.executiveSummary.trim(), '');
  }

  if (report.verification) {
    lines.push(verificationSection(report.verification), '');
  }

  lines.push('## Findings', '');
  if (findings.length === 0) {
    lines.push('No findings were reported.', '');
  } else {
    lines.push('| # | Severity | Area | Location | Finding |', '| --- | --- | --- | --- | --- |');
    findings.forEach(({ finding, from }, index) => {
      const title = finding.title.replace(/\|/g, '\\|');
      lines.push(
        `| ${index + 1} | ${finding.severity.toUpperCase()} | ${from.task.role} | ${location(finding) || '—'} | ${title} |`,
      );
    });
    lines.push('');

    findings.forEach(({ finding, from }, index) => {
      lines.push(
        `### ${index + 1}. ${finding.title}`,
        '',
        `**${finding.severity.toUpperCase()}** · reported by \`${from.task.role}\`${location(finding) ? ` · ${location(finding)}` : ''}`,
        '',
        finding.detail.trim(),
        '',
      );
      if (finding.recommendation) {
        lines.push(`**Recommendation.** ${finding.recommendation.trim()}`, '');
      }
    });
  }

  lines.push('## Agent runs', '');
  for (const result of report.results) {
    const profile = SPECIALISTS[result.task.role];
    lines.push(
      `### \`${result.task.role}\` — ${result.task.title}`,
      '',
      `${profile.displayName} · **${result.ok ? result.report.verdict.toUpperCase() : 'FAILED'}** · ` +
        `${result.report.findings.length} finding(s) · ${result.numTurns} turn(s) · ` +
        `${result.toolCalls} tool call(s) · ${formatDuration(result.durationMs)} · ${formatUsd(result.costUsd)}`,
      '',
      result.report.summary.trim() || '_No summary returned._',
      '',
    );
    if (result.error) {
      lines.push(`> **Run error:** ${result.error}`, '');
    }
    if (result.report.filesChanged.length > 0) {
      lines.push(
        '**Files changed**',
        '',
        ...result.report.filesChanged.map((file) => `- \`${file}\``),
        '',
      );
    }
    if (result.report.followUps.length > 0) {
      lines.push(
        '**Follow-ups left for a human**',
        '',
        ...result.report.followUps.map((item) => `- ${item}`),
        '',
      );
    }
    if (result.sessionId) {
      lines.push(`<sub>Session \`${result.sessionId}\`</sub>`, '');
    }
  }

  lines.push(
    '---',
    '',
    `<sub>Generated by the KEN AI multi-agent system · ${report.finishedAt}</sub>`,
    '',
  );

  return lines.join('\n');
}

export interface WrittenReport {
  markdownPath: string;
  jsonPath: string;
}

export async function writeReport(report: MissionReport): Promise<WrittenReport> {
  await mkdir(REPORTS_DIR, { recursive: true });
  const stamp = report.startedAt.replace(/[:.]/g, '-');
  const base = `${stamp}-${report.mission}`;
  const markdownPath = path.join(REPORTS_DIR, `${base}.md`);
  const jsonPath = path.join(REPORTS_DIR, `${base}.json`);

  await writeFile(markdownPath, renderMarkdown(report), 'utf8');
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  return { markdownPath, jsonPath };
}
