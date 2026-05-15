const express = require("express");
const rateLimit = require("express-rate-limit");
const {
    makePurchase,
    getOrders,
    getCustomerOrders,
    getOrderDetail,
    changeOrderStatus,
    getOrderItems,
    applyDiscount
} = require("../controllers/orderController");
const { requireAdmin, requireAuth, requireOwnerOrAdmin, requireCustomerOrAdmin } = require("../middlewares/authMiddleWares");
const { getRouteLimit } = require("../utils/rateLimitConfig");
const router = express.Router();

const orderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(100),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/", orderLimiter, requireAdmin, getOrders);
router.get("/item", orderLimiter, requireAdmin, getOrderItems);
router.get("/user/:uid", orderLimiter, requireAuth, requireOwnerOrAdmin("uid"), getCustomerOrders);
router.get("/:oid", orderLimiter, requireAuth, getOrderDetail);
router.post("/purchase/:uid", orderLimiter, requireAuth, requireOwnerOrAdmin("uid"), makePurchase);
router.post("/status/:oid", orderLimiter, requireAdmin, changeOrderStatus);
router.post("/discount", orderLimiter, requireAuth, requireCustomerOrAdmin, applyDiscount);

module.exports = router;
