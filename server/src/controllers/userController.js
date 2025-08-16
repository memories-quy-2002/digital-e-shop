const userService = require("../services/userService");
const { endSession } = require("../services/sessionService");

async function registerUser(req, res) {
    const { uid, user } = req.body;
    try {
        const { uid: newUid, token, sessionId } = await userService.registerUser(uid, user);

        res.cookie("session", sessionId, { httpOnly: true, secure: true, sameSite: "None", maxAge: 1000 * 60 * 60 * 24 * 30 });
        res.cookie("userInfo", JSON.stringify({ uid: newUid, token }), { httpOnly: true, secure: true, sameSite: "None", maxAge: 1000 * 60 * 60 * 24 * 30 });

        res.status(200).json({ uid: newUid, token, msg: "User created successfully" });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ msg: "Error creating user" });
    }

};

async function getUserLoginById(req, res) {
    try {
        const user = await userService.getUserById(req.params.id, req);
        res.status(200).json({ userData: user, msg: "User logged in successfully" });
    } catch (err) {
        res.status(401).json({ msg: err.message });
    }
};

async function getAllUsers(req, res) {
    try {
        const users = await userService.getAllUsers();
        res.status(200).json({
            accounts: users,
            msg: "Get users successfully"
        });
    } catch (err) {
        res.status(500).json({ msg: "Error fetching users" });
    }
};

async function userLogin(req, res) {
    const { uid, role } = req.body;
    try {
        const { user, token, sessionId } = await userService.loginUser(uid, role);

        res.cookie("session", sessionId, { httpOnly: true, secure: true, sameSite: "None", maxAge: 1000 * 60 * 60 * 24 * 30 });
        res.cookie("userInfo", JSON.stringify({ uid: user.id, token }), { httpOnly: true, secure: true, sameSite: "None", maxAge: 1000 * 60 * 60 * 24 * 30 });

        res.status(200).json({ uid: user.id, token, msg: "Login successfully" });
    } catch (err) {
        res.status(401).json({ msg: err.message });
    }
};

async function userLogout(req, res) {
    const sessionId = req.cookies.session;

    console.log("Logout sessionId:", sessionId);

    const clearAllCookies = () => {
        res.clearCookie("session", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
        });
        res.clearCookie("userInfo", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "None",
        });
        if (req.cookies.rememberMe) {
            res.clearCookie("rememberMe", {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "None",
            });
        }
    };

    try {
        if (!sessionId || sessionId === "undefined") {
            clearAllCookies();
            return res.status(200).json({ msg: "You have been logout successfully (no session)" });
        }

        const session = await endSession(sessionId);
        clearAllCookies();

        if (!session) {
            return res.status(200).json({ msg: "You have been logout successfully (session not found)" });
        }

        return res.status(200).json({ msg: "You have been logout successfully" });
    } catch (err) {
        console.error(err);
        clearAllCookies();
        return res.status(500).json({ msg: "Internal server error" });
    }
}


module.exports = { registerUser, getUserLoginById, userLogin, userLogout, getAllUsers };