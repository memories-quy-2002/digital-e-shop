const express = require("express");
const { addItemToWishlist, getWishlist, deleteWishlistItem } = require("../controllers/wishlistController");
const { requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();

router.get("/:uid", requireAuth, requireOwnerOrAdmin("uid"), getWishlist);
router.post("/", requireAuth, requireOwnerOrAdmin("uid"), addItemToWishlist);
router.delete("/:pid", requireAuth, requireOwnerOrAdmin("uid"), deleteWishlistItem);

module.exports = router;
