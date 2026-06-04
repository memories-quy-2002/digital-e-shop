import { Router } from "express";
import rateLimit from "express-rate-limit";
const { getAddresses, createAddress, updateAddress, deleteAddress } = require("./addresses.controller");
const { requireAuth, requireOwnerOrAdmin } = require("#src/modules/auth/auth.middleware");
import { getRouteLimit } from "#src/shared/utils/rateLimit";

const router = Router();

const addressesLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:id/addresses", addressesLimiter, requireAuth, requireOwnerOrAdmin("id"), getAddresses);
router.post("/:id/addresses", addressesLimiter, requireAuth, requireOwnerOrAdmin("id"), createAddress);
router.put("/:id/addresses/:addressId", addressesLimiter, requireAuth, requireOwnerOrAdmin("id"), updateAddress);
router.delete("/:id/addresses/:addressId", addressesLimiter, requireAuth, requireOwnerOrAdmin("id"), deleteAddress);

export default router;

