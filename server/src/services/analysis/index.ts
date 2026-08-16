import { env } from "../../config/env.js";
import type { AnalysisRunner } from "./AnalysisRunner.js";
import { ExternalAnalysisRunner } from "./ExternalAnalysisRunner.js";
import { UnconfiguredAnalysisRunner } from "./UnconfiguredAnalysisRunner.js";

export function createAnalysisRunner(): AnalysisRunner {
  if (env.ANALYSIS_RUNNER_URL) {
    return new ExternalAnalysisRunner(env.ANALYSIS_RUNNER_URL);
  }
  return new UnconfiguredAnalysisRunner();
}

export const analysisRunner: AnalysisRunner = createAnalysisRunner();
