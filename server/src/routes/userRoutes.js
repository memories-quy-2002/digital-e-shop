const express = require("express");
const { registerUser, getUserLoginById, userLogin, userLogout, getAllUsers } = require("../controllers/userController");
const { checkSessionToken } = require("../services/sessionService");
const router = express.Router();

router.post("/register", registerUser);
router.get("/:id", getUserLoginById);
router.post("/login", userLogin);
router.post("/logout", userLogout);
router.get("/session/check", checkSessionToken)
router.get("/", getAllUsers);

module.exports = router;
