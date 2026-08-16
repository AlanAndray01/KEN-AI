import { z } from "zod";
import { GPT_CATEGORIES, GPT_VISIBILITY, MODEL_CAPABILITIES, PROVIDER_TYPES } from "../constants/index.js";

export const healthStatusSchema = z.enum(["ok", "degraded", "error"]);

export const databaseHealthStatusSchema = z.enum([
  "connected",
  "disconnected",
  "not_configured",
]);

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  timestamp: z.string(),
  service: z.string(),
  database: z.object({
    status: databaseHealthStatusSchema,
  }),
});

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(320),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(320),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(8).max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1).max(4096),
});

export const upsertProviderSchema = z.object({
  providerId: z.string().trim().min(1).max(64).optional(),
  name: z.string().trim().min(1).max(120),
  type: z.enum(PROVIDER_TYPES),
  apiKey: z.string().min(1).max(4096).optional(),
  baseUrl: z.string().trim().url().max(500).optional(),
  enabled: z.boolean().optional(),
  models: z
    .array(
      z.object({
        modelId: z.string().trim().min(1).max(160),
        name: z.string().trim().min(1).max(160),
        description: z.string().max(2000).optional(),
        capabilities: z.array(z.enum(MODEL_CAPABILITIES)).optional(),
        contextWindow: z.number().int().positive().optional(),
      }),
    )
    .optional(),
});

export const patchProviderSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  apiKey: z.string().min(1).max(4096).optional(),
  baseUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  enabled: z.boolean().optional(),
});

export const upsertUserCredentialSchema = z.object({
  apiKey: z.string().min(1).max(4096),
  baseUrl: z.string().trim().url().max(500).optional(),
  enabled: z.boolean().optional(),
});

export const patchModelSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(160).optional(),
  description: z.string().max(2000).optional(),
});

export const testProviderSchema = z.object({
  apiKey: z.string().min(1).max(4096).optional(),
  baseUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
});

export const enableFlagSchema = z.object({
  enabled: z.boolean(),
});

export const createConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  modelId: z.string().trim().min(1).max(160),
  providerId: z.string().trim().min(1).max(64),
  customGptId: z.string().trim().min(1).max(64).optional(),
});

export const patchConversationSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  archived: z.boolean().optional(),
  pinned: z.boolean().optional(),
  modelId: z.string().trim().min(1).max(160).optional(),
  providerId: z.string().trim().min(1).max(64).optional(),
});

export const sendMessageSchema = z
  .object({
    content: z.string().trim().max(32_000).default(""),
    conversationId: z.string().trim().min(1).max(64).optional(),
    modelId: z.string().trim().min(1).max(160).optional(),
    providerId: z.string().trim().min(1).max(64).optional(),
    attachmentIds: z.array(z.string().trim().min(1).max(64)).max(8).optional(),
    enabledTools: z.array(z.enum(["web_search", "image_generation", "data_analysis"])).max(3).optional(),
    customGptId: z.string().trim().min(1).max(64).optional(),
  })
  .refine((value) => value.content.length > 0 || (value.attachmentIds?.length ?? 0) > 0, {
    message: "Message or attachment is required",
  });

export const messageFeedbackSchema = z.object({
  rating: z.enum(["up", "down"]),
  comment: z.string().trim().max(2000).optional(),
});

export const abortGenerationSchema = z.object({
  generationId: z.string().trim().min(1).max(80).optional(),
  conversationId: z.string().trim().min(1).max(64).optional(),
});

export const webSearchSchema = z.object({
  query: z.string().trim().min(1).max(500),
});

export const imageGenerationSchema = z.object({
  prompt: z.string().trim().min(1).max(4000),
});

export const speakSchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

export const createAnalysisJobSchema = z.object({
  language: z.enum(["python"]).default("python"),
  code: z.string().trim().min(1).max(50_000),
  fileIds: z.array(z.string().trim().min(1).max(64)).max(8).optional(),
});

export const createMemorySchema = z.object({
  content: z.string().trim().min(1).max(4000),
  conversationId: z.string().trim().min(1).max(64).optional(),
});

export const patchMemorySchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export const upsertInstructionSchema = z.object({
  aboutUser: z.string().trim().max(4000).default(""),
  howToRespond: z.string().trim().max(4000).default(""),
  additional: z.string().trim().max(4000).default(""),
});

export const createGptSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(2000).optional(),
  avatar: z.string().trim().url().max(500).optional().or(z.literal("")),
  instructions: z.string().max(32_000).default(""),
  conversationStarters: z.array(z.string().trim().min(1).max(280)).max(4).optional(),
  knowledgeFileIds: z.array(z.string().trim().min(1).max(64)).max(8).optional(),
  capabilities: z.array(z.enum(MODEL_CAPABILITIES)).max(12).optional(),
  modelId: z.string().trim().min(1).max(160).optional(),
  providerId: z.string().trim().min(1).max(64).optional(),
  visibility: z.enum(GPT_VISIBILITY).default("private"),
  category: z.enum(GPT_CATEGORIES).default("other"),
});

export const patchGptSchema = createGptSchema.partial();

export const exportFormatSchema = z.enum(["md", "json", "txt"]);

export const patchMeSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    preferences: z
      .object({
        theme: z.enum(["light", "dark", "system"]).optional(),
        language: z.string().trim().min(2).max(16).optional(),
        sendOnEnter: z.boolean().optional(),
      })
      .optional(),
  })
  .refine((value) => value.name !== undefined || value.preferences !== undefined, {
    message: "Name or preferences is required",
  });
