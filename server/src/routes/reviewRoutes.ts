const express = require("express");
const rateLimit = require("express-rate-limit");
const { addReview, getReviews } = require("../controllers/reviewController");
const { requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");
const { getRouteLimit } = require("../utils/rateLimitConfig");

const router = express.Router();

const reviewLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/:pid", reviewLimiter, getReviews);
router.post("/", reviewLimiter, requireAuth, requireOwnerOrAdmin("uid"), addReview);

module.exports = router;
