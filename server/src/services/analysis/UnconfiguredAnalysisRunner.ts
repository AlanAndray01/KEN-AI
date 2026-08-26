import { AppError } from "../../utils/AppError.js";
import type { PublicAnalysisJob } from "@Ken/shared";
import type { AnalysisRunner, AnalysisSubmitInput } from "./AnalysisRunner.js";

export class UnconfiguredAnalysisRunner implements AnalysisRunner {
  readonly id = "none";

  isConfigured(): boolean {
    return false;
  }

  unavailableReason(): string {
    return "Isolated data-analysis sandbox is not configured. Code is never executed inside the API process.";
  }

  async submit(_input: AnalysisSubmitInput): Promise<PublicAnalysisJob> {
    throw new AppError(this.unavailableReason(), {
      statusCode: 503,
      code: "ANALYSIS_SANDBOX_NOT_CONFIGURED",
      expose: true,
    });
  }

  async get(_userId: string, _jobId: string): Promise<PublicAnalysisJob> {
    throw new AppError("Analysis job not found", { statusCode: 404, code: "ANALYSIS_JOB_NOT_FOUND" });
  }
}
