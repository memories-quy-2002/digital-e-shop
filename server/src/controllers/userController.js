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
    const { uid, role, rememberMe } = req.body;
    try {
        const { user, token: accessToken, sessionId, refreshToken } =
            await userService.loginUser(uid, role, rememberMe);

        // ✅ Nếu không rememberMe thì KHÔNG set maxAge (cookie = session cookie)
        const sessionCookieOptions = {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            ...(rememberMe && { maxAge: 1000 * 60 * 60 * 24 * 30 }) // 30 ngày
        };

        res.cookie("session", sessionId, sessionCookieOptions);
        res.cookie("userInfo", JSON.stringify({ uid: user.id }), { httpOnly: true, secure: true, sameSite: "None", maxAge: 1000 * 60 * 60 * 24 * 30 });
        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "None",
            maxAge: rememberMe ? 1000 * 60 * 60 * 24 * 7 : null, // 7 ngày nếu rememberMe
        });
        if (rememberMe && refreshToken) {
            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: "None",
                maxAge: 1000 * 60 * 60 * 24 * 7, // refresh token sống 7 ngày
            });
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
        // Hàm này trả về access token mới
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


module.exports = { registerUser, getUserLoginById, getCurrentUser, userLogin, userRefreshToken, userLogout, getAllUsers };