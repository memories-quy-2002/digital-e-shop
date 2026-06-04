import { Router } from "express";
import rateLimit from "express-rate-limit";
const { getAnalyticsSummary } = require("./analytics.controller");
const { requireAdmin } = require("#src/modules/auth/auth.middleware");
import { getRouteLimit } from "#src/shared/utils/rateLimit";

const router = Router();

const analyticsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/summary", analyticsLimiter, requireAdmin, getAnalyticsSummary);

export default router;

