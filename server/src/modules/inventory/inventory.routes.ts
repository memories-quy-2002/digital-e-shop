import { Router } from "express";
import rateLimit from "express-rate-limit";
const { getInventorySummary } = require("#src/modules/products/products.controller");
const { getInventoryMovements } = require("./inventory.controller");
const { requireAdmin } = require("#src/modules/auth/auth.middleware");
import { cacheResponse } from "#src/core/cacheResponse";

const router = Router();

const inventoryLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100000,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

const cache = cacheResponse(300);

router.get("/inventory-summary", inventoryLimiter, requireAdmin, cache, getInventorySummary);
router.get("/inventory-movements", inventoryLimiter, requireAdmin, cache, getInventoryMovements);

export default router;
