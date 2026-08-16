import { Router } from "express";
import {
  adminCreateProvider,
  adminDeleteProvider,
  adminEnableProvider,
  adminListModels,
  adminListProviders,
  adminPatchModel,
  adminTestProvider,
  adminUpdateProvider,
} from "../controllers/providerController.js";
import { adminUsageHandler } from "../controllers/usageController.js";
import { requireAdmin, requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/providers", asyncHandler(adminListProviders));
adminRouter.post("/providers", asyncHandler(adminCreateProvider));
adminRouter.patch("/providers/:id", asyncHandler(adminUpdateProvider));
adminRouter.post("/providers/:id/test", asyncHandler(adminTestProvider));
adminRouter.post("/providers/:id/enable", asyncHandler(adminEnableProvider));
adminRouter.delete("/providers/:id", asyncHandler(adminDeleteProvider));
adminRouter.get("/models", asyncHandler(adminListModels));
adminRouter.patch("/models/:providerId/:modelId", asyncHandler(adminPatchModel));
adminRouter.get("/usage", asyncHandler(adminUsageHandler));
