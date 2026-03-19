const jwt = require("jsonwebtoken");
const Session = require("../models/sessionModel");

// Start session and save to DB
async function startSession(userId) {
    return new Promise((resolve, reject) => {
        Session.startSession(userId, (err, results) => {
            if (err) {
                console.error(err.message);
                return reject(err);
            }
            resolve(results.insertId); // return sessionId
        });
    });
}

// Verify session (sessionId + access token)
async function verifySessionToken(req) {
    const sessionId = req.cookies.session; // only a number
    const accessToken = req.cookies.accessToken;

    if (!sessionId || !accessToken) {
        return { valid: false, message: "Missing session or access token" };
    }

    try {
        // 1. Verify JWT access token
        jwt.verify(accessToken, process.env.JWT_SECRET_KEY);

        // 2. Check session exists in DB
        const session = await new Promise((resolve, reject) => {
            Session.getSessionById(sessionId, (err, results) => {
                if (err) return reject(err);
                resolve(results && results.length > 0 ? results[0] : null);
            });
        });

        if (!session) {
            return { valid: false, message: "Session not found" };
        }

        return { valid: true };
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

// End session
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
