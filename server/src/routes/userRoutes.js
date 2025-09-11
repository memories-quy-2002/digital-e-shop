const express = require("express");
const { registerUser, getUserLoginById, userLogin, userRefreshToken, userLogout, getAllUsers, getCurrentUser } = require("../controllers/userController");
const { checkSessionToken } = require("../services/sessionService");
const router = express.Router();

router.get("/me", getCurrentUser);
router.get("/:id", getUserLoginById);
router.get("/session/check", checkSessionToken)
router.get("/", getAllUsers);

router.post("/register", registerUser);
router.post("/login", userLogin);
router.post("/refresh", userRefreshToken);
router.post("/logout", userLogout);


module.exports = router;
