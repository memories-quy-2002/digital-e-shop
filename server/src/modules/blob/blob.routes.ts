import { Router } from "express";
import rateLimit from "express-rate-limit";
const { blobHealthCheck, uploadImage } = require("./blob.controller");
const { requireAdmin } = require("#src/modules/auth/auth.middleware");
import { getRouteLimit } from "#src/shared/utils/rateLimit";

const router = Router();

const blobLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(50),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many blob requests, please try again later.",
});

router.get("/health", blobLimiter, blobHealthCheck);
router.post("/upload", blobLimiter, requireAdmin, uploadImage);

export default router;

