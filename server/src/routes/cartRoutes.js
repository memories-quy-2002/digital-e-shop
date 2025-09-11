const express = require("express");
const {
    addItemToCart,
    getCartItems,
    deleteCartItem,
} = require("../controllers/cartController");
const router = express.Router();

router.get("/:uid", getCartItems);
router.post("/", addItemToCart);
router.delete("/", deleteCartItem);

module.exports = router;
