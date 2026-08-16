import type { Request, Response } from "express";
import {
  enableFlagSchema,
  patchModelSchema,
  patchProviderSchema,
  testProviderSchema,
  upsertProviderSchema,
  upsertUserCredentialSchema,
} from "@aether/shared";
import { AppError } from "../utils/AppError.js";
import { modelRegistry } from "../services/ai/ModelRegistry.js";
import {
  createProvider,
  deleteProvider,
  deleteUserCredential,
  listAdminModels,
  listAdminProviders,
  listPublicProviders,
  listUserCredentials,
  patchModel,
  testProviderConnection,
  updateProvider,
  upsertUserCredential,
} from "../services/ai/providerService.js";

function requireUserId(req: Request): string {
  if (!req.auth) {
    throw new AppError("Authentication required", { statusCode: 401, code: "UNAUTHORIZED" });
  }
  return req.auth.userId;
}

export async function listModels(req: Request, res: Response): Promise<void> {
  const models = await modelRegistry.listPublicModels(requireUserId(req));
  res.status(200).json({ models });
}

export async function listProviders(req: Request, res: Response): Promise<void> {
  const providers = await listPublicProviders(requireUserId(req));
  res.status(200).json({ providers });
}

export async function adminListProviders(_req: Request, res: Response): Promise<void> {
  const providers = await listAdminProviders();
  res.status(200).json({ providers });
}

export async function adminCreateProvider(req: Request, res: Response): Promise<void> {
  const body = upsertProviderSchema.parse(req.body);
  const provider = await createProvider(body);
  res.status(201).json({ provider });
}

export async function adminUpdateProvider(req: Request, res: Response): Promise<void> {
  const body = patchProviderSchema.parse(req.body);
  const provider = await updateProvider(req.params.id ?? "", body);
  res.status(200).json({ provider });
}

export async function adminEnableProvider(req: Request, res: Response): Promise<void> {
  const body = enableFlagSchema.parse(req.body);
  const provider = await updateProvider(req.params.id ?? "", { enabled: body.enabled });
  res.status(200).json({ provider });
}

export async function adminDeleteProvider(req: Request, res: Response): Promise<void> {
  await deleteProvider(req.params.id ?? "");
  res.status(200).json({ ok: true });
}

export async function adminTestProvider(req: Request, res: Response): Promise<void> {
  const body = testProviderSchema.parse(req.body ?? {});
  const provider = await testProviderConnection(req.params.id ?? "", body);
  res.status(200).json({ provider });
}

export async function adminListModels(_req: Request, res: Response): Promise<void> {
  const models = await listAdminModels();
  res.status(200).json({ models });
}

export async function adminPatchModel(req: Request, res: Response): Promise<void> {
  const body = patchModelSchema.parse(req.body);
  const model = await patchModel(req.params.providerId ?? "", req.params.modelId ?? "", body);
  res.status(200).json({ model });
}

export async function listMyCredentials(req: Request, res: Response): Promise<void> {
  const credentials = await listUserCredentials(requireUserId(req));
  res.status(200).json({ credentials });
}

export async function upsertMyCredential(req: Request, res: Response): Promise<void> {
  const body = upsertUserCredentialSchema.parse(req.body);
  const credential = await upsertUserCredential(
    requireUserId(req),
    (req.params.providerId ?? "").toLowerCase(),
    body,
  );
  res.status(200).json({ credential });
}

export async function deleteMyCredential(req: Request, res: Response): Promise<void> {
  await deleteUserCredential(requireUserId(req), (req.params.providerId ?? "").toLowerCase());
  res.status(200).json({ ok: true });
}
