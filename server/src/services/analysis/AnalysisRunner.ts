import type { PublicAnalysisJob } from "@aether/shared";

export interface AnalysisSubmitInput {
  userId: string;
  language: "python";
  code: string;
  fileIds?: string[];
}

export interface AnalysisRunner {
  readonly id: string;
  isConfigured(): boolean;
  unavailableReason(): string;
  submit(input: AnalysisSubmitInput): Promise<PublicAnalysisJob>;
  get(userId: string, jobId: string): Promise<PublicAnalysisJob>;
}
