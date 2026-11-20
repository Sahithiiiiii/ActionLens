import { Router } from "express";
import { requireAuth } from "../auth/auth.middleware.js";
import {
  deleteNotification,
  listNotifications,
  markAllRead,
  markRead,
  stream,
  unreadCount,
} from "./notification.controller.js";

const router = Router();

router.use(requireAuth);

router.get("/stream", stream); // keep above "/:id" routes
router.get("/unread-count", unreadCount);
router.get("/", listNotifications);
router.post("/read-all", markAllRead);
router.patch("/:id/read", markRead);
router.delete("/:id", deleteNotification);

export default router;
