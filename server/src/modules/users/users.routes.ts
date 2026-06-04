import { Router } from "express";
import rateLimit from "express-rate-limit";
import { requireAdmin, requireAuth, requireOwnerOrAdmin } from "#src/modules/auth/auth.middleware";
import { getRouteLimit } from "#src/shared/utils/rateLimit";
import { validateRequest } from "#src/core/middlewares/validateRequest";
import { adminUserUpdateSchema } from "./users.validator";
import { usersController } from "./users.controller";

const router = Router();

const userLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/me", userLimiter, requireAuth, usersController.getCurrentUser);
router.get("/:id/profile", userLimiter, requireAdmin, usersController.getCustomerProfile);
router.get("/:id", userLimiter, requireAuth, requireOwnerOrAdmin("id"), usersController.getUserById);
router.get("/", userLimiter, requireAdmin, usersController.getAllUsers);
router.put("/:id", userLimiter, requireAdmin, validateRequest(adminUserUpdateSchema), usersController.updateUserAdmin);

export default router;

