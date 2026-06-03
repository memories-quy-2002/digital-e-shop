import { Router } from "express";
import rateLimit from "express-rate-limit";
const { addItemToWishlist, getWishlist, deleteWishlistItem, deleteWishlistItems } = require("./wishlist.controller");
const { requireAuth, requireOwnerOrAdmin } = require("#/modules/auth/auth.middleware");
import { getRouteLimit } from "#/shared/utils/rateLimit";

const router = Router();

const wishlistLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:uid", wishlistLimiter, requireAuth, requireOwnerOrAdmin("uid"), getWishlist);
router.post("/", wishlistLimiter, requireAuth, requireOwnerOrAdmin("uid"), addItemToWishlist);
router.delete("/", wishlistLimiter, requireAuth, requireOwnerOrAdmin("uid"), deleteWishlistItems);
router.delete("/:pid", wishlistLimiter, requireAuth, requireOwnerOrAdmin("uid"), deleteWishlistItem);

export default router;
