import type { AppCookieOptions, AppRequest, AppResponse, DbError } from "../types/domain";
const userService = require("../services/userService");
const { endSession } = require("../services/sessionService");
const {
    adminUserUpdateSchema,
    getValidationMessage,
    parseBody,
    registerUserSchema,
    userLoginSchema,
} = require("../validation/requestSchemas");

const isProduction = process.env.NODE_ENV === "production";
const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;

const baseCookieOptions: AppCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
};

const withMaxAge = (maxAge: number): AppCookieOptions => ({
    ...baseCookieOptions,
    maxAge,
});

async function registerUser(req: AppRequest, res: AppResponse) {
    try {
        const { uid, user } = parseBody(registerUserSchema, req.body);
        const { uid: newUid, token, sessionId } = await userService.registerUser(uid, user);

        res.cookie("session", sessionId, withMaxAge(THIRTY_DAYS));
        res.cookie("userInfo", JSON.stringify({ uid: newUid, token }), withMaxAge(THIRTY_DAYS));
        res.cookie("accessToken", token, withMaxAge(THIRTY_DAYS));

        res.status(200).json({ uid: newUid, token, msg: "User created successfully" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        const error = err as DbError;
        if (error && error.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ msg: "User already exists" });
        }
        console.error(error.message || error);
        res.status(500).json({ msg: "Error creating user" });
    }
}

async function getUserLoginById(req: AppRequest, res: AppResponse) {
    try {
        const user = await userService.getUserById(req.params.id, req);
        res.status(200).json({ userData: user, msg: "User logged in successfully" });
    } catch (err) {
        const error = err as Error;
        res.status(401).json({ msg: error.message });
    }
}

async function getAllUsers(req: AppRequest, res: AppResponse) {
    try {
        const page = Number(req.query.page);
        const limit = Number(req.query.limit);
        const usePagination = Number.isInteger(page) && page > 0 && Number.isInteger(limit) && limit > 0;
        const safeLimit = usePagination ? Math.min(limit, 100) : null;
        const offset = usePagination ? (page - 1) * safeLimit : 0;

        if (usePagination) {
            const [users, total] = await Promise.all([
                userService.getAllUsersPaginated(safeLimit, offset),
                userService.getUsersCount(),
            ]);
            return res.status(200).json({
                accounts: users,
                pagination: {
                    page,
                    limit: safeLimit,
                    total,
                    totalPages: Math.ceil(total / safeLimit),
                },
                msg: "Get users successfully",
            });
        }

        const users = await userService.getAllUsers();
        res.status(200).json({ accounts: users, msg: "Get users successfully" });
    } catch {
        res.status(500).json({ msg: "Error fetching users" });
    }
}

async function updateUserAdmin(req: AppRequest, res: AppResponse) {
    const uid = req.params.id;

    try {
        const { role, status } = parseBody(adminUserUpdateSchema, req.body);
        const account = await userService.updateUserAdmin(uid, { role, status });
        return res.status(200).json({ account, msg: "Account updated successfully" });
    } catch (err) {
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        const error = err as Error;
        return res.status(500).json({ msg: error.message || "Error updating account" });
    }
}

async function getCustomerProfile(req: AppRequest, res: AppResponse) {
    try {
        const profile = await userService.getCustomerProfile(req.params.id);
        if (!profile) {
            return res.status(404).json({ msg: "Customer not found" });
        }
        return res.status(200).json({ profile, msg: "Customer profile retrieved successfully" });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: "Error fetching customer profile" });
    }
}

async function userLogin(req: AppRequest, res: AppResponse) {
    try {
        const { uid, role, rememberMe } = parseBody(userLoginSchema, req.body);
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
        if (err?.name === "ZodError") {
            return res.status(400).json({ msg: getValidationMessage(err) });
        }
        const error = err as Error;
        res.status(401).json({ msg: error.message });
    }
}

async function userRefreshToken(req: AppRequest, res: AppResponse) {
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
    } catch {
        return res.status(403).json({ msg: "Invalid refresh token" });
    }
}

async function getCurrentUser(req: AppRequest, res: AppResponse) {
    try {
        const accessToken = req.cookies.accessToken;
        const sessionId = req.cookies.session;
        const userData = await userService.getCurrentUser(accessToken, sessionId);

        return res.status(200).json({ userData });
    } catch (err) {
        const error = err as { status?: number; msg?: string };
        return res
            .status(error.status || 500)
            .json({ msg: error.msg || "Unexpected server error" });
    }
}

async function userLogout(req: AppRequest, res: AppResponse) {
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
    updateUserAdmin,
    getCustomerProfile,
};
