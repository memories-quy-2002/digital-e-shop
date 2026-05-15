const express = require("express");
const rateLimit = require("express-rate-limit");
const {
    getPromotions,
    createPromotion,
    updatePromotion,
    deletePromotion,
} = require("../controllers/promotionController");
const { requireAdmin } = require("../middlewares/authMiddleWares");
const { getRouteLimit } = require("../utils/rateLimitConfig");

const router = express.Router();

const promotionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/", promotionLimiter, requireAdmin, getPromotions);
router.post("/", promotionLimiter, requireAdmin, createPromotion);
router.put("/:id", promotionLimiter, requireAdmin, updatePromotion);
router.delete("/:id", promotionLimiter, requireAdmin, deletePromotion);

module.exports = router;
