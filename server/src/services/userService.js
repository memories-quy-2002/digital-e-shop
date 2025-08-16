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

async function loginUser(uid, role) {
    return new Promise((resolve, reject) => {
        User.getUserById(uid, async (err, results) => {
            if (err) return reject(err);
            if (results.length === 0) return reject(new Error("Invalid username, password, or role"));

            const user = results[0];
            if (user.role !== role) return reject(new Error("Invalid username, password, or role"));

            try {
                jwt.verify(user.token, process.env.JWT_SECRET_KEY);
                const sessionId = await startSession(user.id);
                resolve({ user, token: user.token, sessionId });
            } catch {
                const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET_KEY, { expiresIn: "30d" });
                User.updateUserToken(user.id, token, async (err) => {
                    if (err) return reject(err);
                    const sessionId = await startSession(user.id);
                    resolve({ user, token, sessionId });
                });
            }
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

module.exports = { registerUser, loginUser, getUserById, getAllUsers };
