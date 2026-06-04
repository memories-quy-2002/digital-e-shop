import { Router } from "express";
import rateLimit from "express-rate-limit";
const { addReview, getReviews } = require("./reviews.controller");
const { requireAuth, requireOwnerOrAdmin } = require("#src/modules/auth/auth.middleware");
import { getRouteLimit } from "#src/shared/utils/rateLimit";

const router = Router();

const reviewLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:pid", reviewLimiter, getReviews);
router.post("/", reviewLimiter, requireAuth, requireOwnerOrAdmin("uid"), addReview);

export default router;

