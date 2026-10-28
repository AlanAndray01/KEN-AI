import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AppError } from "../../utils/AppError.js";
import { AnalysisJob } from "../../models/AnalysisJob.js";
import type { PublicAnalysisJob } from "@Ken/shared";
import type { AnalysisRunner, AnalysisSubmitInput } from "./AnalysisRunner.js";
import { loadOwnedFiles } from "../storage/fileService.js";

const responseSchema = z.object({
  id: z.string().min(1).max(256).optional(),
  status: z.enum(["queued", "running", "succeeded", "completed", "failed", "rejected"]),
  output: z.string().max(65_536).optional(),
  message: z.string().max(1000).optional(),
});
const terminal = new Set(["succeeded", "failed", "rejected"]);
const MAX_JOB_MS = 15 * 60_000;

export class ExternalAnalysisRunner implements AnalysisRunner {
  readonly id = "external";
  constructor(private readonly runnerUrl: string) {}
  isConfigured(): boolean { return this.runnerUrl.length > 0; }
  unavailableReason(): string { return "Isolated data-analysis sandbox is not configured."; }

  private async request(path: string, init: RequestInit = {}) {
    try {
      const response = await fetch(this.runnerUrl.replace(/\/$/, "") + path, {
        ...init, headers: { "Content-Type": "application/json", Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error("Runner rejected request");
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing runner response");
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 400_000) { await reader.cancel(); throw new Error("Runner response too large"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      return responseSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    } catch {
      throw new AppError("Isolated analysis runner returned an invalid response or is unreachable.", {
        statusCode: 502, code: "ANALYSIS_RUNNER_ERROR",
      });
    }
  }

  async submit(input: AnalysisSubmitInput): Promise<PublicAnalysisJob> {
    if (input.fileIds?.length) await loadOwnedFiles(input.userId, input.fileIds);
    const id = randomUUID();
    const job = await AnalysisJob.create({ _id: id, userId: input.userId, upstreamId: id,
      status: "queued", language: input.language, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000) });
    try {
      const result = await this.request("/jobs", { method: "POST", body: JSON.stringify({
        id, language: input.language, code: input.code, ...(input.fileIds ? { fileIds: input.fileIds } : {}),
      }) });
      job.upstreamId = result.id ?? id;
      job.status = result.status === "completed" ? "succeeded" : result.status;
      job.message = result.message ?? ("Analysis " + job.status);
      job.output = result.output ?? null;
      await job.save();
      return toPublic(job);
    } catch (error) {
      job.status = "failed";
      job.message = "Isolated runner request failed";
      await job.save();
      throw error;
    }
  }

  async get(userId: string, jobId: string): Promise<PublicAnalysisJob> {
    const job = await AnalysisJob.findOne({ _id: jobId, userId, expiresAt: { $gt: new Date() } });
    if (!job) throw new AppError("Analysis job not found", { statusCode: 404, code: "ANALYSIS_JOB_NOT_FOUND" });
    if (!terminal.has(job.status)) {
      if (Date.now() - job.createdAt.getTime() > MAX_JOB_MS) {
        job.status = "failed";
        job.message = "Analysis exceeded its time limit";
      } else {
        const result = await this.request("/jobs/" + encodeURIComponent(job.upstreamId));
        job.status = result.status === "completed" ? "succeeded" : result.status;
        job.message = result.message ?? ("Analysis " + job.status);
        job.output = result.output ?? null;
      }
      // Concurrent polls must not regress a terminal result or overwrite a
      // newer running state with an older queued response.
      const updated = await AnalysisJob.findOneAndUpdate({ _id: job._id, userId,
        status: { $in: job.status === "queued" ? ["queued"] : ["queued", "running"] } },
      { $set: { status: job.status, message: job.message, output: job.output } }, { returnDocument: "after" });
      if (updated) return toPublic(updated);
      const current = await AnalysisJob.findOne({ _id: job._id, userId });
      if (!current) throw new AppError("Analysis job not found", { statusCode: 404, code: "ANALYSIS_JOB_NOT_FOUND" });
      return toPublic(current);
    }
    return toPublic(job);
  }
}

function toPublic(job: { _id: string; status: PublicAnalysisJob["status"]; createdAt: Date;
  message: string; output?: string | null }): PublicAnalysisJob {
  return { id: job._id, status: job.status, language: "python", createdAt: job.createdAt.toISOString(),
    message: job.message, ...(job.output !== undefined && job.output !== null ? { output: job.output } : {}) };
}
