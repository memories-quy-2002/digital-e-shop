const express = require("express");
const { addReview, getReviews } = require("../controllers/reviewController");

const router = express.Router();

router.post("/", addReview);
router.get("/:pid", getReviews);

module.exports = router;