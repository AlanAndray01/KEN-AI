import { Router } from "express";
import {
  deleteMyCredential,
  listMyCredentials,
  testMyCredential,
  upsertMyCredential,
} from "../controllers/providerController.js";
import { exportAllConversationsHandler } from "../controllers/exportController.js";
import { updateMeHandler } from "../controllers/meController.js";
import { getInstructionsHandler, upsertInstructionsHandler } from "../controllers/memoryController.js";
import { myUsageHandler } from "../controllers/usageController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const meRouter = Router();

meRouter.use(requireAuth);
meRouter.patch("/", asyncHandler(updateMeHandler));
meRouter.get("/usage", asyncHandler(myUsageHandler));
meRouter.get("/export", asyncHandler(exportAllConversationsHandler));
meRouter.get("/provider-credentials", asyncHandler(listMyCredentials));
meRouter.put("/provider-credentials/:providerId", asyncHandler(upsertMyCredential));
meRouter.post("/provider-credentials/:providerId/test", asyncHandler(testMyCredential));
meRouter.delete("/provider-credentials/:providerId", asyncHandler(deleteMyCredential));
meRouter.get("/instructions", asyncHandler(getInstructionsHandler));
meRouter.put("/instructions", asyncHandler(upsertInstructionsHandler));
