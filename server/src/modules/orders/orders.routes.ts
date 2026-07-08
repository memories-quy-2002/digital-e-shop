import { Router } from "express";
import rateLimit from "express-rate-limit";
const {
    makePurchase,
    createCheckoutSession,
    getOrders,
    getCustomerOrders,
    getOrderDetail,
    getOrderBySessionId,
    changeOrderStatus,
    getOrderItems,
    applyDiscount,
} = require("./orders.controller");
const { requireAdmin, requireAuth, requireOwnerOrAdmin, requireCustomerOrAdmin } = require("#src/modules/auth/auth.middleware");
import { getRouteLimit } from "#src/shared/utils/rateLimit";

const router = Router();

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
router.get("/by-session/:sessionId", orderLimiter, requireAuth, getOrderBySessionId);
router.get("/:oid", orderLimiter, requireAuth, getOrderDetail);
router.post("/purchase/:uid", orderLimiter, requireAuth, requireOwnerOrAdmin("uid"), makePurchase);
router.post("/checkout-session/:uid", orderLimiter, requireAuth, requireOwnerOrAdmin("uid"), createCheckoutSession);
router.post("/status/:oid", orderLimiter, requireAdmin, changeOrderStatus);
router.post("/discount", orderLimiter, requireAuth, requireCustomerOrAdmin, applyDiscount);

export default router;

