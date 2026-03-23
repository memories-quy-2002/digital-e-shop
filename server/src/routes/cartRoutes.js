const express = require("express");
const {
    addItemToCart,
    getCartItems,
    deleteCartItem,
} = require("../controllers/cartController");
const { requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();

router.get("/:uid", requireAuth, requireOwnerOrAdmin("uid"), getCartItems);
router.post("/", requireAuth, requireOwnerOrAdmin("uid"), addItemToCart);
router.delete("/", requireAuth, deleteCartItem);

module.exports = router;
