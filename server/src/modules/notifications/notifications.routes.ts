import { Router } from "express";
import rateLimit from "express-rate-limit";
const {
    getNotifications,
    markNotificationRead,
    markAllNotificationsRead,
} = require("./notifications.controller");
const { requireAuth, requireOwnerOrAdmin } = require("#/modules/auth/auth.middleware");
import { getRouteLimit } from "#/shared/utils/rateLimit";

const router = Router();

const notificationsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:id/notifications", notificationsLimiter, requireAuth, requireOwnerOrAdmin("id"), getNotifications);
router.post("/:id/notifications/read-all", notificationsLimiter, requireAuth, requireOwnerOrAdmin("id"), markAllNotificationsRead);
router.post("/:id/notifications/:notificationId/read", notificationsLimiter, requireAuth, requireOwnerOrAdmin("id"), markNotificationRead);

export default router;
