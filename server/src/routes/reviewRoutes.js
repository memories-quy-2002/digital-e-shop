const express = require("express");
const { addReview, getReviews } = require("../controllers/reviewController");

const router = express.Router();

router.get("/:pid", getReviews);
router.post("/", addReview);

module.exports = router;