const express = require("express");
const { registerUser, getUserLoginById, userLogin, userRefreshToken, userLogout, getAllUsers, getCurrentUser } = require("../controllers/userController");
const { checkSessionToken } = require("../services/sessionService");
const { requireAdmin, requireAuth, requireOwnerOrAdmin } = require("../middlewares/authMiddleWares");
const router = express.Router();

router.get("/me", requireAuth, getCurrentUser);
router.get("/session/check", checkSessionToken);
router.get("/:id", requireAuth, requireOwnerOrAdmin("id"), getUserLoginById);
router.get("/", requireAdmin, getAllUsers);

router.post("/register", registerUser);
router.post("/login", userLogin);
router.post("/refresh", userRefreshToken);
router.post("/logout", userLogout);


module.exports = router;
