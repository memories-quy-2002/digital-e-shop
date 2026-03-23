const express = require("express");
const rateLimit = require("express-rate-limit");
const { registerUser, getUserLoginById, userLogin, userRefreshToken, userLogout, getAllUsers, getCurrentUser } = require("../controllers/userController");
const { checkSessionToken } = require("../services/sessionService");
const { requireAdmin, requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();

const userLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many requests, please try again later.",
});

router.get("/me", userLimiter, requireAuth, getCurrentUser);
router.get("/session/check", userLimiter, checkSessionToken);
router.get("/:id", userLimiter, requireAuth, requireOwnerOrAdmin("id"), getUserLoginById);
router.get("/", userLimiter, requireAdmin, getAllUsers);

router.post("/register", userLimiter, registerUser);
router.post("/login", userLimiter, userLogin);
router.post("/refresh", userLimiter, userRefreshToken);
router.post("/logout", userLimiter, userLogout);


module.exports = router;
