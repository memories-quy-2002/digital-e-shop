const pool = require("../config/db");
import type { InsertResult, QueryCallback, SessionRow, UpdateResult } from "../types/domain";

const startSession = (userId: string, callback: QueryCallback<InsertResult>) => {
    const sessionStart = new Date();
    pool.query(
        `INSERT INTO customer_sessions (user_id, session_start) VALUES (?, ?)`,
        [userId, sessionStart], callback
    )
}

const getSessionById = (sessionId: number, callback: QueryCallback<SessionRow[]>) => {
    pool.query(`SELECT session_start FROM customer_sessions WHERE id = ?`, [sessionId], callback);
};

const updateSession = (sessionId: number | string, sessionEnd: Date, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        `UPDATE customer_sessions SET session_end = ? WHERE id = ?`,
        [sessionEnd, parseInt(String(sessionId), 10)],
        callback
    );
};

module.exports = { startSession, getSessionById, updateSession };
