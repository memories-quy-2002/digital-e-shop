const express = require("express");
const {
    addItemToCart,
    getCartItems,
    deleteCartItem,
} = require("../controllers/cartController");
const router = express.Router();

router.post("/", addItemToCart);
router.get("/:uid", getCartItems);
router.post("/delete", deleteCartItem);

module.exports = router;
