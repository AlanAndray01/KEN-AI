import { z } from "zod";
import {
  GPT_CATEGORIES,
  GPT_VISIBILITY,
  MAX_MESSAGE_CONTENT_CHARS,
  MODEL_CAPABILITIES,
  PROVIDER_TYPES,
} from "../constants/index.js";

export const PASSWORD_POLICY_MESSAGE = "Password must be at least 6 characters";

export const passwordSchema = z.string().min(6, PASSWORD_POLICY_MESSAGE).max(128);

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
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(320),
});

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: passwordSchema,
    token: z.string().trim().min(1).max(512).optional(),
    code: z.string().trim().regex(/^\d{6}$/).optional(),
  })
  .refine((value) => Boolean(value.token || value.code), {
    message: "Enter the 6-digit reset code",
    path: ["code"],
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

/**
 * Account deletion is irreversible, so it is gated twice: the account email must
 * be retyped, and local accounts must also re-enter their password. Google-only
 * accounts have no password to check, so `password` stays optional here and the
 * server decides which proof it actually requires.
 */
export const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().email().max(320),
  password: z.string().min(1).max(128).optional(),
});

export const verifyEmailSchema = z.object({
  email: z.string().trim().email().max(320),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export const resendVerificationSchema = z.object({
  email: z.string().trim().email().max(320),
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

const providerIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-z0-9_-]*$/, "Invalid provider id");

export const saveProviderKeySchema = z.object({
  providerId: providerIdSchema,
  apiKey: z
    .string()
    .trim()
    .min(8)
    .max(4096)
    // Matching control characters is the point: a key carrying CR/LF or a NUL
    // byte must be rejected before it can reach an outbound request header.
    // eslint-disable-next-line no-control-regex
    .refine((value) => !/[\u0000-\u001f]/.test(value), "Invalid API key"),
  modelId: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .regex(/^[a-zA-Z0-9._:/-]+$/, "Invalid model id")
    .optional(),
  label: z.string().trim().min(1).max(160).optional(),
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
    content: z.string().trim().max(MAX_MESSAGE_CONTENT_CHARS).default(""),
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

/**
 * Editing a user turn resends it, so the content must be non-empty — unlike
 * sendMessageSchema, an edit cannot fall back to attachments alone.
 */
export const editMessageSchema = z.object({
  content: z.string().trim().min(1).max(MAX_MESSAGE_CONTENT_CHARS),
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
        selectedProviderId: z.string().trim().min(1).max(64).optional(),
        selectedModelId: z.string().trim().min(1).max(160).optional(),
      })
      .optional(),
  })
  .refine((value) => value.name !== undefined || value.preferences !== undefined, {
    message: "Name or preferences is required",
  });
