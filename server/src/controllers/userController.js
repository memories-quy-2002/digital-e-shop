const userService = require("../services/userService");
const { endSession } = require("../services/sessionService");

const isProduction = process.env.NODE_ENV === "production";
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;

const baseCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "None" : "Lax",
};

const withMaxAge = (maxAge) => ({
    ...baseCookieOptions,
    maxAge,
});

async function registerUser(req, res) {
    const { uid, user } = req.body;
    try {
        const { uid: newUid, token, sessionId } = await userService.registerUser(uid, user);

        res.cookie("session", sessionId, withMaxAge(THIRTY_DAYS));
        res.cookie("userInfo", JSON.stringify({ uid: newUid, token }), withMaxAge(THIRTY_DAYS));
        res.cookie("accessToken", token, withMaxAge(THIRTY_DAYS));

        res.status(200).json({ uid: newUid, token, msg: "User created successfully" });
    } catch (err) {
        if (err && err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ msg: "User already exists" });
        }
        console.error(err.message || err);
        res.status(500).json({ msg: "Error creating user" });
    }
}

async function getUserLoginById(req, res) {
    try {
        const user = await userService.getUserById(req.params.id, req);
        res.status(200).json({ userData: user, msg: "User logged in successfully" });
    } catch (err) {
        res.status(401).json({ msg: err.message });
    }
}

async function getAllUsers(req, res) {
    try {
        const users = await userService.getAllUsers();
        res.status(200).json({
            accounts: users,
            msg: "Get users successfully",
        });
    } catch (err) {
        res.status(500).json({ msg: "Error fetching users" });
    }
}

async function userLogin(req, res) {
    const { uid, role, rememberMe } = req.body;
    try {
        const { user, token: accessToken, sessionId, refreshToken } =
            await userService.loginUser(uid, role, rememberMe);

        const sessionCookieOptions = rememberMe ? withMaxAge(THIRTY_DAYS) : baseCookieOptions;

        res.cookie("session", sessionId, sessionCookieOptions);
        res.cookie("userInfo", JSON.stringify({ uid: user.id }), rememberMe ? withMaxAge(THIRTY_DAYS) : baseCookieOptions);
        res.cookie("accessToken", accessToken, rememberMe ? withMaxAge(THIRTY_DAYS) : baseCookieOptions);

        if (rememberMe && refreshToken) {
            res.cookie("refreshToken", refreshToken, withMaxAge(THIRTY_DAYS));
        }

        res.status(200).json({
            userData: user,
            token: accessToken,
            msg: "Login successfully",
        });
    } catch (err) {
        res.status(401).json({ msg: err.message });
    }
}

async function userRefreshToken(req, res) {
    const refreshTokenCookie = req.cookies.refreshToken;
    if (!refreshTokenCookie) {
        return res.status(401).json({ msg: "No refresh token" });
    }

    try {
        const newAccessToken = await userService.refreshToken(refreshTokenCookie);

        res.status(200).json({
            token: newAccessToken,
            msg: "Token refreshed successfully",
        });
    } catch (err) {
        return res.status(403).json({ msg: "Invalid refresh token" });
    }
}

async function getCurrentUser(req, res) {
    try {
        const accessToken = req.cookies.accessToken;
        const sessionId = req.cookies.session;
        const userData = await userService.getCurrentUser(accessToken, sessionId);

        return res.status(200).json({ userData });
    } catch (err) {
        return res
            .status(err.status || 500)
            .json({ msg: err.msg || "Unexpected server error" });
    }
}

async function userLogout(req, res) {
    const sessionId = req.cookies.session;

    console.log("Logout sessionId:", sessionId);

    const clearAllCookies = () => {
        res.clearCookie("session", baseCookieOptions);
        res.clearCookie("userInfo", baseCookieOptions);
        res.clearCookie("accessToken", baseCookieOptions);
        res.clearCookie("refreshToken", baseCookieOptions);
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

module.exports = {
    registerUser,
    getUserLoginById,
    getCurrentUser,
    userLogin,
    userRefreshToken,
    userLogout,
    getAllUsers,
};
