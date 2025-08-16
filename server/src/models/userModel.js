const pool = require("../config/db");

const getUserById = (uid, callback) => {
    pool.query("SELECT * FROM users WHERE id = ?", [uid], callback);
};

const getAllUsers = (callback) => {
    pool.query("SELECT * FROM users", callback);
};

const createUser = (uid, username, email, password, role, callback) => {
    pool.query(
        "INSERT INTO users (id, username, email, password, role, token) VALUES (?, ?, ?, ?, ?, '')",
        [uid, username, email, password, role],
        callback
    );
};

const updateUserToken = (uid, token, callback) => {
    pool.query(
        "UPDATE users SET token = ?, last_login=CURRENT_TIMESTAMP WHERE id = ?",
        [token, uid],
        callback
    );
};

module.exports = { getUserById, getAllUsers, createUser, updateUserToken };
