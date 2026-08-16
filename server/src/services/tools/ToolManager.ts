import type { ChatToolId, ModelCapability, PublicAnalysisJob, PublicFile, PublicSearchHit, PublicTool } from "@aether/shared";
import { AppError } from "../../utils/AppError.js";
import type { ChatMessage } from "../ai/AIProvider.js";
import { analysisRunner } from "../analysis/index.js";
import type { AnalysisRunner } from "../analysis/AnalysisRunner.js";
import { imageGenerationProvider } from "../image/index.js";
import type { ImageGenerationProvider } from "../image/ImageGenerationProvider.js";
import { searchProvider } from "../search/index.js";
import type { SearchProvider } from "../search/SearchProvider.js";
import { uploadUserFile } from "../storage/fileService.js";

export interface ToolExecuteContext {
  userId: string;
}

export type ToolExecuteResult =
  | { type: "search"; hits: PublicSearchHit[] }
  | { type: "image"; file: PublicFile }
  | { type: "analysis"; job: PublicAnalysisJob };

export interface ChatToolOutcome {
  systemMessages: ChatMessage[];
  files: PublicFile[];
}

function modelSupportsTools(capabilities?: ModelCapability[]): boolean {
  if (!capabilities) return true;
  return capabilities.includes("tools") || capabilities.includes("webSearch");
}

export function formatSearchHits(hits: PublicSearchHit[]): string {
  if (hits.length === 0) {
    return "Web search returned no results. Do not invent sources or URLs.";
  }
  const lines = hits.map(
    (hit, index) => `${index + 1}. ${hit.title}\n   ${hit.url}\n   ${hit.snippet}`,
  );
  return `Web search results. Use these sources; do not invent URLs.\n\n${lines.join("\n\n")}`;
}

export class ToolManager {
  constructor(
    private readonly search: SearchProvider = searchProvider,
    private readonly images: ImageGenerationProvider = imageGenerationProvider,
    private readonly analysis: AnalysisRunner = analysisRunner,
  ) {}

  listPublic(capabilities?: ModelCapability[]): PublicTool[] {
    const searchConfigured = this.search.isConfigured();
    const searchAvailable = searchConfigured && modelSupportsTools(capabilities);
    const imageConfigured = this.images.isConfigured();
    const analysisConfigured = this.analysis.isConfigured();

    return [
      {
        id: "web_search",
        name: "Web search",
        description: "Search the public web and attach results to the model context.",
        configured: searchConfigured,
        available: searchAvailable,
        ...(!searchAvailable
          ? {
              unavailableReason: searchConfigured
                ? "This model cannot use tools."
                : this.search.unavailableReason(),
            }
          : {}),
      },
      {
        id: "image_generation",
        name: "Image generation",
        description: "Generate an image from a text prompt.",
        configured: imageConfigured,
        available: imageConfigured,
        ...(!imageConfigured ? { unavailableReason: this.images.unavailableReason() } : {}),
      },
      {
        id: "data_analysis",
        name: "Data analysis",
        description: "Run Python in an isolated sandbox. Code never executes inside the API process.",
        configured: analysisConfigured,
        available: analysisConfigured,
        ...(!analysisConfigured ? { unavailableReason: this.analysis.unavailableReason() } : {}),
      },
    ];
  }

  async execute(
    name: ChatToolId,
    args: { query?: string; prompt?: string; code?: string; fileIds?: string[]; language?: "python" },
    ctx: ToolExecuteContext,
  ): Promise<ToolExecuteResult> {
    if (name === "web_search") {
      const query = args.query?.trim() ?? "";
      if (!query) {
        throw new AppError("Search query is required", { statusCode: 400, code: "VALIDATION_ERROR" });
      }
      const hits = await this.search.search({ query });
      return { type: "search", hits };
    }

    if (name === "image_generation") {
      const prompt = args.prompt?.trim() ?? "";
      if (!prompt) {
        throw new AppError("Image prompt is required", { statusCode: 400, code: "VALIDATION_ERROR" });
      }
      const generated = await this.images.generate({ prompt, userId: ctx.userId });
      const file = await uploadUserFile({
        userId: ctx.userId,
        originalName: "aether-image.png",
        mimeType: generated.mimeType,
        buffer: generated.buffer,
      });
      return { type: "image", file };
    }

    const code = args.code?.trim() ?? "";
    if (!code) {
      throw new AppError("Analysis code is required", { statusCode: 400, code: "VALIDATION_ERROR" });
    }
    const job = await this.analysis.submit({
      userId: ctx.userId,
      language: args.language ?? "python",
      code,
      ...(args.fileIds ? { fileIds: args.fileIds } : {}),
    });
    return { type: "analysis", job };
  }

  async applyForChat(input: {
    enabledTools?: ChatToolId[];
    content: string;
    userId: string;
    capabilities: ModelCapability[];
  }): Promise<ChatToolOutcome> {
    const enabled = input.enabledTools ?? [];
    const systemMessages: ChatMessage[] = [];
    const files: PublicFile[] = [];

    if (enabled.includes("web_search")) {
      if (!modelSupportsTools(input.capabilities)) {
        throw new AppError("This model cannot use tools.", {
          statusCode: 400,
          code: "MODEL_TOOLS_UNSUPPORTED",
          expose: true,
        });
      }
      const result = await this.execute("web_search", { query: input.content }, { userId: input.userId });
      if (result.type === "search") {
        systemMessages.push({ role: "system", content: formatSearchHits(result.hits) });
      }
    }

    if (enabled.includes("image_generation")) {
      const result = await this.execute(
        "image_generation",
        { prompt: input.content },
        { userId: input.userId },
      );
      if (result.type === "image") files.push(result.file);
    }

    if (enabled.includes("data_analysis")) {
      await this.execute("data_analysis", { code: input.content }, { userId: input.userId });
    }

    return { systemMessages, files };
  }

  getAnalysisJob(userId: string, jobId: string): Promise<PublicAnalysisJob> {
    return this.analysis.get(userId, jobId);
  }
}

export const toolManager = new ToolManager();
