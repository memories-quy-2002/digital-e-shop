const express = require("express");
const {
    makePurchase,
    getOrders,
    changeOrderStatus,
    getOrderItems,
    applyDiscount
} = require("../controllers/orderController");
const { requireAdmin, requireAuth, requireOwnerOrAdmin, requireCustomerOrAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();

router.get("/", requireAdmin, getOrders);
router.get("/item", requireAdmin, getOrderItems);
router.post("/purchase/:uid", requireAuth, requireOwnerOrAdmin("uid"), makePurchase);
router.post("/status/:oid", requireAdmin, changeOrderStatus);
router.post("/discount", requireAuth, requireCustomerOrAdmin, applyDiscount);

module.exports = router;
