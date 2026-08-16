import { Router } from "express";
import {
  listNotificationsHandler,
  markAllNotificationsReadHandler,
  markNotificationReadHandler,
} from "../controllers/notificationController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get("/", asyncHandler(listNotificationsHandler));
notificationsRouter.post("/read-all", asyncHandler(markAllNotificationsReadHandler));
notificationsRouter.post("/:id/read", asyncHandler(markNotificationReadHandler));
