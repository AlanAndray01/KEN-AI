import type { Request, Response } from "express";
import type { ModelCapability } from "@Ken/shared";
import {
  createAnalysisJobSchema,
  imageGenerationSchema,
  webSearchSchema,
} from "@Ken/shared";
import { modelRegistry } from "../services/ai/ModelRegistry.js";
import { aiProviderManager } from "../services/ai/AIProviderManager.js";
import { AppError } from "../utils/AppError.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function listToolsHandler(req: Request, res: Response): Promise<void> {
  const userId = requireUserId(req);
  const providerId = typeof req.query.providerId === "string" ? req.query.providerId : undefined;
  const modelId = typeof req.query.modelId === "string" ? req.query.modelId : undefined;
  let capabilities: ModelCapability[] | undefined;
  if (providerId && modelId) {
    try {
      const model = await modelRegistry.assertModelAvailable(providerId, modelId, userId);
      capabilities = model.capabilities;
    } catch {
      capabilities = [];
    }
  }
  const tools =
    capabilities === undefined ? aiProviderManager.listTools() : aiProviderManager.listTools(capabilities);
  res.status(200).json({ tools });
}

export async function searchHandler(req: Request, res: Response): Promise<void> {
  const body = webSearchSchema.parse(req.body);
  const result = await aiProviderManager.runTool("web_search", { query: body.query }, { userId: requireUserId(req) });
  if (result.type !== "search") {
    throw new AppError("Search failed", { statusCode: 502, code: "SEARCH_PROVIDER_ERROR" });
  }
  res.status(200).json({ hits: result.hits });
}

export async function generateImageHandler(req: Request, res: Response): Promise<void> {
  const body = imageGenerationSchema.parse(req.body);
  const result = await aiProviderManager.runTool(
    "image_generation",
    { prompt: body.prompt },
    { userId: requireUserId(req) },
  );
  if (result.type !== "image") {
    throw new AppError("Image generation failed", { statusCode: 502, code: "IMAGE_GENERATION_PROVIDER_ERROR" });
  }
  res.status(201).json({ file: result.file });
}

export async function createAnalysisJobHandler(req: Request, res: Response): Promise<void> {
  const body = createAnalysisJobSchema.parse(req.body);
  const result = await aiProviderManager.runTool(
    "data_analysis",
    {
      code: body.code,
      language: body.language,
      ...(body.fileIds ? { fileIds: body.fileIds } : {}),
    },
    { userId: requireUserId(req) },
  );
  if (result.type !== "analysis") {
    throw new AppError("Analysis job failed", { statusCode: 502, code: "ANALYSIS_RUNNER_ERROR" });
  }
  res.status(202).json({ job: result.job });
}

export async function getAnalysisJobHandler(req: Request, res: Response): Promise<void> {
  const job = await aiProviderManager.getAnalysisJob(requireUserId(req), req.params.id ?? "");
  res.status(200).json({ job });
}
