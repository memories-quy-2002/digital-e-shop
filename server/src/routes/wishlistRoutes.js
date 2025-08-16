const express = require("express");
const { addItemToWishlist, getWishlist, deleteWishlistItem } = require("../controllers/wishlistController");
const router = express.Router();

router.post("/api/wishlist", addItemToWishlist);
router.get("/api/wishlist/:uid", getWishlist);
router.post("/api/wishlist/delete", deleteWishlistItem);

module.exports = router;