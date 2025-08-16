const express = require("express");
const {
    makePurchase,
    getOrders,
    changeOrderStatus,
    getOrderItems,
    applyDiscount
} = require("../controllers/orderController");
const router = express.Router();

router.post("/purchase/:uid", makePurchase);
router.get("/", getOrders);
router.post("/status/:oid", changeOrderStatus);
router.get("/item", getOrderItems);
router.post("/discount", applyDiscount);

module.exports = router;