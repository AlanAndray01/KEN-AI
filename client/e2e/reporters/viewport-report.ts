import type { FullResult, Reporter, TestCase, TestResult } from "@playwright/test/reporter";

type AgentId = "desktop" | "tablet-mobile" | "clutter";

const AGENTS: { id: AgentId; label: string; match: RegExp }[] = [
  { id: "desktop", label: "Desktop Regression Agent", match: /desktop-regression/ },
  { id: "tablet-mobile", label: "Tablet & Mobile Viewport Agent", match: /tablet-mobile-viewport|landing-mobile-menu|landing-story-graphics|auth-responsive/ },
  { id: "clutter", label: "Chat Interface Clutter Agent", match: /chat-interface-clutter/ },
];

interface AgentScore {
  passed: number;
  failed: number;
  skipped: number;
}

function emptyScore(): AgentScore {
  return { passed: 0, failed: 0, skipped: 0 };
}

function classify(test: TestCase): AgentId | "other" {
  const file = test.location.file.replace(/\\/g, "/");
  for (const agent of AGENTS) {
    if (agent.match.test(file)) return agent.id;
  }
  return "other";
}

export default class ViewportReport implements Reporter {
  private readonly scores: Record<AgentId | "other", AgentScore> = {
    desktop: emptyScore(),
    "tablet-mobile": emptyScore(),
    clutter: emptyScore(),
    other: emptyScore(),
  };

  onTestEnd(test: TestCase, result: TestResult): void {
    const agent = classify(test);
    const score = this.scores[agent];
    if (result.status === "passed") score.passed += 1;
    else if (result.status === "skipped") score.skipped += 1;
    else score.failed += 1;
  }

  onEnd(result: FullResult): void {
    const line = "─".repeat(56);
    const rows = AGENTS.map((agent) => {
      const score = this.scores[agent.id];
      const total = score.passed + score.failed;
      const status = score.failed > 0 ? "FAIL" : total === 0 ? "SKIP" : "PASS";
      const detail = `${score.passed} passed / ${score.failed} failed / ${score.skipped} skipped`;
      return { label: agent.label, status, detail };
    });

    const overall =
      result.status === "passed" && rows.every((row) => row.status !== "FAIL") ? "PASS" : "FAIL";

    // Playwright's list reporter already printed per-test lines. This block is
    // the requested Pass/Fail summary for the three viewport agents.
    console.log(`\n${line}`);
    console.log("KEN AI automated viewport report");
    console.log(line);
    for (const row of rows) {
      const pad = ".".repeat(Math.max(2, 36 - row.label.length));
      console.log(`${row.label} ${pad} ${row.status}`);
      console.log(`  ${row.detail}`);
    }
    console.log(line);
    console.log(`Overall: ${overall}`);
    console.log(`${line}\n`);
  }
}
