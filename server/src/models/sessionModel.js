const pool = require("../config/db");

const startSession = (userId, callback) => {
    const sessionStart = new Date();
    const sessionMonth = sessionStart.getMonth() + 1; // Month (1-12)
    const sessionYear = sessionStart.getFullYear(); // Year
    pool.query(
        `INSERT INTO customer_sessions (user_id, session_start, session_month, session_year) VALUES (?, ?, ?, ?)`,
        [userId, sessionStart, sessionMonth, sessionYear], callback
    )
}

const getSessionById = (sessionId, callback) => {
    pool.query(`SELECT session_start FROM customer_sessions WHERE id = ?`, [sessionId], callback);
};

const updateSession = (sessionId, sessionEnd, sessionDuration, callback) => {
    pool.query(
        `UPDATE customer_sessions SET session_end = ?, session_duration = ? WHERE id = ?`,
        [sessionEnd, sessionDuration, parseInt(sessionId)],
        callback
    );
};

module.exports = { startSession, getSessionById, updateSession };
