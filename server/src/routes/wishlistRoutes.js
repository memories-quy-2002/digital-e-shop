const express = require("express");
const { addItemToWishlist, getWishlist, deleteWishlistItem } = require("../controllers/wishlistController");
const router = express.Router();

router.get("/:uid", getWishlist);
router.post("/", addItemToWishlist);
router.delete("/:pid", deleteWishlistItem);

module.exports = router;