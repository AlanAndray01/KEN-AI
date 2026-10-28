import fs from "node:fs";
import path from "node:path";
import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import type { LayoutAudit } from "./audit";

export default class ResponsiveReporter implements Reporter {
  private results: { test: string; project: string; status: string; audit?: LayoutAudit; screenshots: string[]; errors: string[] }[] = [];
  onTestEnd(test: TestCase, result: TestResult): void {
    const attachment = result.attachments.find(item => item.name === "layout-audit.json");
    const raw = attachment?.body ?? (attachment?.path ? fs.readFileSync(attachment.path) : undefined);
    this.results.push({ test: test.title, project: test.parent.project()?.name || "unknown", status: result.status,
      ...(raw ? { audit: JSON.parse(raw.toString()) as LayoutAudit } : {}),
      screenshots: result.attachments.filter(item => item.contentType === "image/png" && item.path).map(item => item.path!),
      errors: result.errors.map(error => error.message || "Unknown test error") });
  }
  onEnd(result: FullResult): void {
    if (!this.results.length) return; // --list must not overwrite an actual audit.
    const directory = path.resolve("client/playwright-report/responsive-audit");
    fs.mkdirSync(directory, { recursive: true });
    this.results.sort((a, b) => a.test.localeCompare(b.test) || a.project.localeCompare(b.project));
    const audited = this.results.filter(item => item.audit);
    const layoutFailures = audited.filter(item => item.audit!.issues.length);
    const setupFailures = this.results.filter(item => !item.audit && !["passed", "skipped"].includes(item.status));
    const summary = { status: result.status, total: this.results.length, audited: audited.length,
      passed: this.results.filter(item => item.status === "passed").length, layoutFailures: layoutFailures.length,
      setupFailures: setupFailures.length, generatedAt: new Date().toISOString() };
    fs.writeFileSync(path.join(directory, "results.json"), JSON.stringify({ summary, results: this.results }, null, 2));
    const escape = (value: unknown) => String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const lines = ["# Responsive layout audit", "", `Generated: ${summary.generatedAt}`, "",
      `${summary.total} tests; ${summary.audited} page/viewport audits; ${summary.passed} passed; ${summary.layoutFailures} layout failures; ${summary.setupFailures} setup/runtime failures.`, "",
      "Chromium, local Vite frontend, intercepted APIs, 1024x1024 square SVG fixture. No inference calls. Source hints are candidates, not automatic fixes.", ""];
    for (const item of layoutFailures) {
      const audit = item.audit!;
      lines.push(`## ${audit.scenario} — ${audit.viewport.width}x${audit.viewport.height}`, "", `URL: ${audit.url}`, "",
        `Source candidates: ${audit.sourceHints.map(source => `\`${source}\``).join(", ")}`, "",
        "| Problem | Selector | Width | Left | Right | Viewport width | Detail / matched width rules |",
        "| --- | --- | ---: | ---: | ---: | ---: | --- |");
      for (const issue of audit.issues) lines.push(`| ${issue.kind} | ${escape(issue.selector)} | ${issue.width} | ${issue.left} | ${issue.right} | ${issue.viewportWidth} | ${escape(issue.detail + (issue.declarations?.length ? ` Rules: ${issue.declarations.join("; ")}` : ""))} |`);
      lines.push("", ...item.screenshots.map(file => `Screenshot: [${path.basename(file)}](${path.relative(directory, file).replace(/\\/g, "/")})`), "");
    }
    if (setupFailures.length) lines.push("## Setup/runtime failures (not layout results)", "", ...setupFailures.map(item => `- ${item.project}: ${item.test} — ${escape(item.errors.join("; "))}`), "");
    lines.push("## Coverage", "", "| Test | Viewport | Status | Issues |", "| --- | --- | --- | ---: |");
    for (const item of this.results) lines.push(`| ${escape(item.test)} | ${item.project} | ${item.status} | ${item.audit?.issues.length ?? "not audited"} |`);
    fs.writeFileSync(path.join(directory, "results.md"), lines.join("\n") + "\n");
    console.log(`\nResponsive audit: ${summary.audited} audited, ${summary.layoutFailures} layout failures, ${summary.setupFailures} setup/runtime failures.\nReadable report: ${path.join(directory, "results.md")}\nJSON report: ${path.join(directory, "results.json")}\n`);
  }
}
