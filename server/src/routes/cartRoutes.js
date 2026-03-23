const express = require("express");
const rateLimit = require("express-rate-limit");
const {
    addItemToCart,
    getCartItems,
    deleteCartItem,
} = require("../controllers/cartController");
const { requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();

const cartLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:uid", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), getCartItems);
router.post("/", cartLimiter, requireAuth, requireOwnerOrAdmin("uid"), addItemToCart);
router.delete("/", cartLimiter, requireAuth, deleteCartItem);

module.exports = router;
