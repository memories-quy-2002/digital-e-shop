const express = require("express");
const rateLimit = require("express-rate-limit");
const { blobHealthCheck, uploadImage } = require("../controllers/blobController");
const { requireAdmin } = require("../middlewares/authMiddleWares");
const { getRouteLimit } = require("../utils/rateLimitConfig");

const router = express.Router();

const blobLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: getRouteLimit(50),
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many blob requests, please try again later.",
});

router.get("/health", blobLimiter, blobHealthCheck);
router.post("/upload", blobLimiter, requireAdmin, uploadImage);

module.exports = router;
