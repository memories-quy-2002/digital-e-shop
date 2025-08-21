const express = require("express");
const { addItemToWishlist, getWishlist, deleteWishlistItem } = require("../controllers/wishlistController");
const router = express.Router();

router.post("/", addItemToWishlist);
router.get("/:uid", getWishlist);
router.post("/delete", deleteWishlistItem);

module.exports = router;