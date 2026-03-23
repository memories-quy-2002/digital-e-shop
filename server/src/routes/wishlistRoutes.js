const express = require("express");
const rateLimit = require("express-rate-limit");
const { addItemToWishlist, getWishlist, deleteWishlistItem } = require("../controllers/wishlistController");
const { requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();

const wishlistLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:uid", wishlistLimiter, requireAuth, requireOwnerOrAdmin("uid"), getWishlist);
router.post("/", wishlistLimiter, requireAuth, requireOwnerOrAdmin("uid"), addItemToWishlist);
router.delete("/:pid", wishlistLimiter, requireAuth, requireOwnerOrAdmin("uid"), deleteWishlistItem);

module.exports = router;
