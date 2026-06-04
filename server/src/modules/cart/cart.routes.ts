import { Router } from "express";
import rateLimit from "express-rate-limit";
const {
    addItemToCart,
    getCartItems,
    validateCartForCheckout,
    updateCartItemQuantity,
    deleteCartItem,
} = require("./cart.controller");
const { requireAuth, requireOwnerOrAdmin } = require("#src/modules/auth/auth.middleware");
import { getRouteLimit } from "#src/shared/utils/rateLimit";

const router = Router();

const cartLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:uid", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), getCartItems);
router.get("/:uid/validation", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), validateCartForCheckout);
router.post("/", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), addItemToCart);
router.put("/", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), updateCartItemQuantity);
router.delete("/", cartLimiter, requireAuth, deleteCartItem);

export default router;

