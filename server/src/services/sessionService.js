const jwt = require("jsonwebtoken");
const Session = require("../models/sessionModel");

async function startSession(userId) {
    return new Promise((resolve, reject) => {
        Session.startSession(userId,
            (err, results) => {
                if (err) {
                    console.error(err.message);
                    return reject(err);
                }
                resolve(results.insertId);
            }
        );
    });
};

const verifySessionToken = (req, res) => {
    const userInfo = req.cookies.userInfo;
    if (!userInfo) {
        return { valid: false, message: "No session information found" };
    }

    try {
        const { token } = JSON.parse(userInfo);
        jwt.verify(token, process.env.JWT_SECRET_KEY);
        return { valid: true };
    } catch (err) {
        console.error("Token verification error:", err.message);
        return { valid: false, message: "Session invalid or expired" };
    }
};

const checkSessionToken = (req, res) => {
    const { valid, message } = verifySessionToken(req);
    if (!valid) {
        return res.status(401).json({ sessionActive: false, msg: message });
    }
    return res.status(200).json({ sessionActive: true });
};

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