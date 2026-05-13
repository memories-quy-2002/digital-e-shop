const express = require("express");
const rateLimit = require("express-rate-limit");
const {
    addItemToCart,
    getCartItems,
    updateCartItemQuantity,
    deleteCartItem,
} = require("../controllers/cartController");
const { requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");
const { getRouteLimit } = require("../utils/rateLimitConfig");
const router = express.Router();

const cartLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:uid", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), getCartItems);
router.post("/", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), addItemToCart);
router.put("/", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), updateCartItemQuantity);
router.delete("/", cartLimiter, requireAuth, deleteCartItem);

module.exports = router;
