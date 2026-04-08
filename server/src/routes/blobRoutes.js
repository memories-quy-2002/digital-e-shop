const express = require("express");
const { blobHealthCheck, uploadImage } = require("../controllers/blobController");
const { requireAdmin } = require("../middlewares/authMiddleWares");

const router = express.Router();

router.get("/health", blobHealthCheck);
router.post("/upload", requireAdmin, uploadImage);

module.exports = router;
