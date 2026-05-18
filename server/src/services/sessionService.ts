const jwt = require("jsonwebtoken");
const Session = require("../models/sessionModel");
import type { AppRequest, AppResponse, DbError, InsertResult, SessionRow } from "../types/domain";

// Start session and save to DB
async function startSession(userId: string): Promise<number> {
    return new Promise((resolve, reject) => {
        Session.startSession(userId, (err: DbError | null, results: InsertResult) => {
            if (err) {
                console.error(err.message);
                return reject(err);
            }
            resolve(results.insertId); // return sessionId
        });
    });
}

// Verify session (sessionId + access token)
async function verifySessionToken(req: AppRequest): Promise<{ valid: boolean; message?: string }> {
    const sessionId = req.cookies.session; // only a number
    const accessToken = req.cookies.accessToken;

    if (!sessionId || !accessToken) {
        return { valid: false, message: "Missing session or access token" };
    }

    try {
        // 1. Verify JWT access token
        jwt.verify(accessToken, process.env.JWT_SECRET_KEY);

        // 2. Check session exists in DB
        const session = await new Promise<SessionRow | null>((resolve, reject) => {
            Session.getSessionById(sessionId, (err: DbError | null, results: SessionRow[]) => {
                if (err) return reject(err);
                resolve(results && results.length > 0 ? results[0] : null);
            });
        });

        if (!session) {
            return { valid: false, message: "Session not found" };
        }

        return { valid: true };
    } catch (err) {
        const error = err as Error;
        console.error("Token verification error:", error.message);
        return { valid: false, message: "Session invalid or expired" };
    }
}

// Endpoint check session
async function checkSessionToken(req: AppRequest, res: AppResponse) {
    try {
        const { valid, message } = await verifySessionToken(req);
        if (!valid) {
            return res.status(401).json({ sessionActive: false, msg: message });
        }
        return res.status(200).json({ sessionActive: true, msg: "Session is valid" });
    } catch (err) {
        const error = err as Error;
        console.error("checkSessionToken error:", error.message);
        return res.status(500).json({ sessionActive: false, msg: "Server error" });
    }
}

// End session
async function endSession(sessionId: number | string): Promise<{ sessionEnd: Date } | null> {
    return new Promise((resolve, reject) => {
        Session.getSessionById(sessionId, (err: DbError | null, results: SessionRow[]) => {
            if (err) return reject(err);
            if (!results || results.length === 0 || !results[0].session_start) {
                return resolve(null); // session not found
            }

            const sessionEnd = new Date();

            Session.updateSession(sessionId, sessionEnd, (err: DbError | null) => {
                if (err) return reject(err);
                resolve({ sessionEnd });
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
