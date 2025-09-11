const jwt = require("jsonwebtoken");
const Session = require("../models/sessionModel");

// Bắt đầu session, lưu vào DB
async function startSession(userId) {
    return new Promise((resolve, reject) => {
        Session.startSession(userId, (err, results) => {
            if (err) {
                console.error(err.message);
                return reject(err);
            }
            resolve(results.insertId); // Trả về sessionId
        });
    });
}

// Xác thực session (dựa vào sessionId + access token)
async function verifySessionToken(req) {
    const sessionId = req.cookies.session; // chỉ là số
    const accessToken = req.cookies.accessToken;

    if (!sessionId || !accessToken) {
        return { valid: false, message: "Missing session or access token" };
    }

    try {
        // 1. Verify JWT access token
        jwt.verify(accessToken, process.env.JWT_SECRET_KEY);

        // 2. Kiểm tra sessionId có tồn tại trong DB
        return new Promise((resolve, reject) => {
            Session.getSessionById(sessionId, (err, results) => {
                if (err) return reject(err);
                if (!results || results.length === 0) {
                    return resolve({ valid: false, message: "Session not found" });
                }
                resolve({ valid: true });
            });
        });
    } catch (err) {
        console.error("Token verification error:", err.message);
        return { valid: false, message: "Session invalid or expired" };
    }
}

// Endpoint check session
async function checkSessionToken(req, res) {
    try {
        const { valid, message } = await verifySessionToken(req);
        if (!valid) {
            return res.status(401).json({ sessionActive: false, msg: message });
        }
        return res.status(200).json({ sessionActive: true, msg: "Session is valid" });
    } catch (err) {
        console.error("checkSessionToken error:", err.message);
        return res.status(500).json({ sessionActive: false, msg: "Server error" });
    }
}

// Kết thúc session
async function endSession(sessionId) {
    return new Promise((resolve, reject) => {
        Session.getSessionById(sessionId, (err, results) => {
            if (err) return reject(err);
            if (!results || results.length === 0 || !results[0].session_start) {
                return resolve(null); // session not found
            }

            const sessionStart = results[0].session_start;
            const sessionEnd = new Date();
            const sessionDuration = Math.floor((sessionEnd - new Date(sessionStart)) / 1000);

            Session.updateSession(sessionId, sessionEnd, sessionDuration, (err) => {
                if (err) return reject(err);
                resolve({ sessionEnd, sessionDuration });
            });
        });
    });
}

module.exports = {
    startSession,
    verifySessionToken,
    checkSessionToken,
    endSession
};
