const jwt = require("jsonwebtoken");
const { hashPassword } = require("../utils/hashPassword");
const User = require("../models/userModel");
const { startSession, verifySessionToken } = require("./sessionService");

async function registerUser(uid, userData) {
    const hashedPassword = await hashPassword(userData.password);

    return new Promise((resolve, reject) => {
        User.createUser(uid, userData.username, userData.email, hashedPassword, userData.role, (err) => {
            if (err) return reject(err);

            const token = jwt.sign({ id: uid, email: userData.email }, process.env.JWT_SECRET_KEY, { expiresIn: "30d" });

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
            if (user.role !== role) return reject(new Error("Invalid username, password, or role"));

            try {
                // Kiểm tra token cũ có hợp lệ không
                jwt.verify(user.token, process.env.JWT_SECRET_KEY);

                let refreshToken = null;
                if (rememberMe) {
                    // Payload chuẩn
                    const payload = { id: user.id, email: user.email, role: user.role };
                    refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET_KEY, {
                        expiresIn: "7d",
                    });
                }

                const sessionId = await startSession(user.id);
                resolve({ user, token: user.token, sessionId, refreshToken });

            } catch {
                // Tạo access token mới
                const payload = { id: user.id, email: user.email, role: user.role };
                const token = jwt.sign(payload, process.env.JWT_SECRET_KEY, { expiresIn: "15m" });

                User.updateUserToken(user.id, token, async (err) => {
                    if (err) return reject(err);

                    let refreshToken = null;
                    if (rememberMe) {
                        refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET_KEY, {
                            expiresIn: "7d",
                        });
                    }

                    const sessionId = await startSession(user.id);
                    resolve({ user, token, sessionId, refreshToken });
                });
            }
        });
    });
}

async function refreshToken(oldRefreshToken) {
    return new Promise((resolve, reject) => {
        jwt.verify(oldRefreshToken, process.env.JWT_REFRESH_SECRET_KEY, (err, payload) => {
            if (err) return reject(err);

            // Payload đồng nhất giữa access & refresh
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
    return new Promise((resolve, reject) => {
        User.getUserById(uid, (err, results) => {
            if (err) return reject(err);
            if (results.length === 0) return reject(new Error("User not found"));

            const { valid, message } = verifySessionToken(req);
            if (!valid) return reject(new Error(message));

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

async function getCurrentUser(accessToken, sessionId) {
    if (!accessToken || !sessionId) {
        throw { status: 401, msg: "Not authenticated" };
    }

    // Verify JWT
    let decoded;
    try {
        decoded = jwt.verify(accessToken, process.env.JWT_SECRET_KEY);
    } catch (err) {
        throw { status: 403, msg: "Invalid or expired token" };
    }

    // Check session
    console.log(decoded)
    return new Promise((resolve, reject) => {
        User.getUserById(decoded.id, (err, results) => {
            if (err) return reject({ status: 500, msg: "Server error" });
            if (results.length === 0) return reject({ status: 404, msg: "User not found" });
            resolve(results[0]);
        });
    });
}

module.exports = { registerUser, refreshToken, getCurrentUser, loginUser, getUserById, getAllUsers };