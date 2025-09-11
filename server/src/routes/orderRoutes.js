const express = require("express");
const {
    makePurchase,
    getOrders,
    changeOrderStatus,
    getOrderItems,
    applyDiscount
} = require("../controllers/orderController");
const router = express.Router();

router.get("/", getOrders);
router.get("/item", getOrderItems);
router.post("/purchase/:uid", makePurchase);
router.post("/status/:oid", changeOrderStatus);
router.post("/discount", applyDiscount);

module.exports = router;