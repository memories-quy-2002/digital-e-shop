const express = require("express");
const { addReview, getReviews } = require("../controllers/reviewController");
const { requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");

const router = express.Router();

router.get("/:pid", getReviews);
router.post("/", requireAuth, requireOwnerOrAdmin("uid"), addReview);

module.exports = router;
