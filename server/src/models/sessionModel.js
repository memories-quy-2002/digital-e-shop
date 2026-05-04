const pool = require("../config/db");

const startSession = (userId, callback) => {
    const sessionStart = new Date();
    pool.query(
        `INSERT INTO customer_sessions (user_id, session_start) VALUES (?, ?)`,
        [userId, sessionStart], callback
    )
}

const getSessionById = (sessionId, callback) => {
    pool.query(`SELECT session_start FROM customer_sessions WHERE id = ?`, [sessionId], callback);
};

const updateSession = (sessionId, sessionEnd, callback) => {
    pool.query(
        `UPDATE customer_sessions SET session_end = ? WHERE id = ?`,
        [sessionEnd, parseInt(sessionId)],
        callback
    );
};

module.exports = { startSession, getSessionById, updateSession };
