import { randomUUID } from "node:crypto";
import { AppError } from "../../utils/AppError.js";
import type { PublicAnalysisJob } from "@aether/shared";
import type { AnalysisRunner, AnalysisSubmitInput } from "./AnalysisRunner.js";

interface StoredJob extends PublicAnalysisJob {
  userId: string;
}

const jobs = new Map<string, StoredJob>();

export class ExternalAnalysisRunner implements AnalysisRunner {
  readonly id = "external";

  constructor(private readonly runnerUrl: string) {}

  isConfigured(): boolean {
    return this.runnerUrl.length > 0;
  }

  unavailableReason(): string {
    return "Isolated data-analysis sandbox is not configured.";
  }

  async submit(input: AnalysisSubmitInput): Promise<PublicAnalysisJob> {
    const id = randomUUID();
    const created: StoredJob = {
      id,
      userId: input.userId,
      status: "queued",
      language: input.language,
      createdAt: new Date().toISOString(),
      message: "Queued on the isolated runner",
    };
    jobs.set(id, created);

    try {
      const response = await fetch(`${this.runnerUrl.replace(/\/$/, "")}/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          id,
          language: input.language,
          code: input.code,
          ...(input.fileIds ? { fileIds: input.fileIds } : {}),
        }),
      });
      if (!response.ok) {
        created.status = "failed";
        created.message = "Isolated runner rejected the job";
        jobs.set(id, created);
        throw new AppError("Isolated analysis runner request failed", {
          statusCode: 502,
          code: "ANALYSIS_RUNNER_ERROR",
        });
      }
      return toPublic(created);
    } catch (error) {
      if (error instanceof AppError) throw error;
      created.status = "failed";
      created.message = "Isolated runner is unreachable";
      jobs.set(id, created);
      throw new AppError("Isolated analysis runner is unreachable", {
        statusCode: 502,
        code: "ANALYSIS_RUNNER_ERROR",
      });
    }
  }

  async get(userId: string, jobId: string): Promise<PublicAnalysisJob> {
    const job = jobs.get(jobId);
    if (!job || job.userId !== userId) {
      throw new AppError("Analysis job not found", { statusCode: 404, code: "ANALYSIS_JOB_NOT_FOUND" });
    }
    return toPublic(job);
  }
}

function toPublic(job: StoredJob): PublicAnalysisJob {
  return {
    id: job.id,
    status: job.status,
    language: job.language,
    createdAt: job.createdAt,
    message: job.message,
  };
}

export function resetAnalysisJobsForTests(): void {
  jobs.clear();
}
