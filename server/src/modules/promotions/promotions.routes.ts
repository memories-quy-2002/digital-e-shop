import { Router } from "express";
import rateLimit from "express-rate-limit";
const { getPromotions, createPromotion, updatePromotion, deletePromotion } = require("./promotions.controller");
const { requireAdmin } = require("#/modules/auth/auth.middleware");
import { getRouteLimit } from "#/shared/utils/rateLimit";

const router = Router();

const promotionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/", promotionLimiter, requireAdmin, getPromotions);
router.post("/", promotionLimiter, requireAdmin, createPromotion);
router.put("/:id", promotionLimiter, requireAdmin, updatePromotion);
router.delete("/:id", promotionLimiter, requireAdmin, deletePromotion);

export default router;
