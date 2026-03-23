const express = require("express");
const rateLimit = require("express-rate-limit");
const {
    makePurchase,
    getOrders,
    changeOrderStatus,
    getOrderItems,
    applyDiscount
} = require("../controllers/orderController");
const { requireAdmin, requireAuth, requireOwnerOrAdmin, requireCustomerOrAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();

const orderLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/", orderLimiter, requireAdmin, getOrders);
router.get("/item", orderLimiter, requireAdmin, getOrderItems);
router.post("/purchase/:uid", orderLimiter, requireAuth, requireOwnerOrAdmin("uid"), makePurchase);
router.post("/status/:oid", orderLimiter, requireAdmin, changeOrderStatus);
router.post("/discount", orderLimiter, requireAuth, requireCustomerOrAdmin, applyDiscount);

module.exports = router;
