const express = require("express");
const rateLimit = require("express-rate-limit");
const { getAnalyticsSummary } = require("../controllers/analyticsController");
const { requireAdmin } = require("../middlewares/authMiddleWares");
const { getRouteLimit } = require("../utils/rateLimitConfig");

const router = express.Router();

const analyticsLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/summary", analyticsLimiter, requireAdmin, getAnalyticsSummary);

module.exports = router;
