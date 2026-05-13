const jwt = require("jsonwebtoken");
const { hashPassword } = require("../utils/hashPassword");
const User = require("../models/userModel");
const { startSession, verifySessionToken } = require("./sessionService");

async function registerUser(uid, userData) {
    const hashedPassword = await hashPassword(userData.password);

    return new Promise((resolve, reject) => {
        User.createUser(uid, userData.username, userData.email, hashedPassword, userData.role, (err) => {
            if (err) return reject(err);

            const token = jwt.sign(
                { id: uid, email: userData.email, role: userData.role },
                process.env.JWT_SECRET_KEY,
                { expiresIn: "30d" }
            );

            User.updateUserToken(uid, token, async (err) => {
                if (err) return reject(err);

                const sessionId = await startSession(uid);
                resolve({ uid, token, sessionId });
            });
        });
    });
}

async function loginUser(uid, role, rememberMe) {
    return new Promise((resolve, reject) => {
        User.getUserById(uid, async (err, results) => {
            if (err) return reject(err);
            if (results.length === 0) return reject(new Error("Invalid username, password, or role"));

            const user = results[0];
            if (role && user.role !== role) return reject(new Error("Invalid username, password, or role"));
            if (user.status === "Suspended") return reject(new Error("Account is suspended"));

            const payload = { id: user.id, email: user.email, role: user.role };
            const accessToken = jwt.sign(payload, process.env.JWT_SECRET_KEY, {
                expiresIn: rememberMe ? "30d" : "15m",
            });

            User.updateUserToken(user.id, accessToken, async (err) => {
                if (err) return reject(err);

                let refreshToken = null;
                if (rememberMe) {
                    refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET_KEY, {
                        expiresIn: "30d",
                    });
                }

                const sessionId = await startSession(user.id);
                resolve({ user, token: accessToken, sessionId, refreshToken });
            });
        });
    });
}

async function refreshToken(oldRefreshToken) {
    return new Promise((resolve, reject) => {
        jwt.verify(oldRefreshToken, process.env.JWT_REFRESH_SECRET_KEY, (err, payload) => {
            if (err) return reject(err);
            const newAccess = jwt.sign(
                { id: payload.id, email: payload.email, role: payload.role },
                process.env.JWT_SECRET_KEY,
                { expiresIn: "15m" }
            );

            resolve(newAccess);
        });
    });
}

async function getUserById(uid, req) {
    const { valid, message } = await verifySessionToken(req);
    if (!valid) throw new Error(message);

    return new Promise((resolve, reject) => {
        User.getUserById(uid, (err, results) => {
            if (err) return reject(err);
            if (results.length === 0) return reject(new Error("User not found"));
            resolve(results[0]);
        });
    });
}

async function getAllUsers() {
    return new Promise((resolve, reject) => {
        User.getAllUsers((err, results) => {
            if (err) return reject(err);
            if (results.length === 0) return resolve([]);
            resolve(results);
        });
    })
}

async function getAllUsersPaginated(limit, offset) {
    return new Promise((resolve, reject) => {
        User.getAllUsersPaginated(limit, offset, (err, results) => {
            if (err) return reject(err);
            resolve(results);
        });
    });
}

async function getUsersCount() {
    return new Promise((resolve, reject) => {
        User.getUsersCount((err, results) => {
            if (err) return reject(err);
            resolve(results[0]?.total || 0);
        });
    });
}

async function updateUserAdmin(uid, { role, status }) {
    return new Promise((resolve, reject) => {
        User.updateUserAdmin(uid, role, status, (err, result) => {
            if (err) return reject(err);
            if (result.affectedRows === 0) return reject(new Error("User not found"));

            User.getUserById(uid, (getErr, results) => {
                if (getErr) return reject(getErr);
                resolve(results[0]);
            });
        });
    });
}

async function getCustomerProfile(uid) {
    const [profileRows, recentOrders] = await Promise.all([
        new Promise((resolve, reject) => {
            User.getCustomerProfile(uid, (err, results) => {
                if (err) return reject(err);
                resolve(results || []);
            });
        }),
        new Promise((resolve, reject) => {
            User.getCustomerRecentOrders(uid, (err, results) => {
                if (err) return reject(err);
                resolve(results || []);
            });
        }),
    ]);

    if (profileRows.length === 0) {
        return null;
    }

    const profile = profileRows[0];
    return {
        ...profile,
        order_count: Number(profile.order_count) || 0,
        total_spent: Number(profile.total_spent) || 0,
        wishlist_count: Number(profile.wishlist_count) || 0,
        recent_orders: recentOrders.map((order) => ({
            ...order,
            total_price: Number(order.total_price) || 0,
            discount: Number(order.discount) || 0,
        })),
    };
}

async function getCurrentUser(accessToken, sessionId) {
    if (!accessToken || !sessionId) {
        throw { status: 401, msg: "Not authenticated" };
    }
    let decoded;
    try {
        decoded = jwt.verify(accessToken, process.env.JWT_SECRET_KEY);
    } catch (err) {
        throw { status: 403, msg: "Invalid or expired token" };
    }

    console.log(decoded)
    return new Promise((resolve, reject) => {
        User.getUserById(decoded.id, (err, results) => {
            if (err) return reject({ status: 500, msg: "Server error" });
            if (results.length === 0) return reject({ status: 404, msg: "User not found" });
            resolve(results[0]);
        });
    });
}

module.exports = {
    registerUser,
    refreshToken,
    getCurrentUser,
    loginUser,
    getUserById,
    getAllUsers,
    getAllUsersPaginated,
    getUsersCount,
    updateUserAdmin,
    getCustomerProfile,
};
