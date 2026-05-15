const pool = require("../config/db");
import type {
    CountRow,
    CustomerProfileRow,
    CustomerRecentOrderRow,
    DbError,
    QueryCallback,
    UpdateResult,
    UserRow,
} from "../types/domain";

let statusColumnReady = false;

const ensureStatusColumn = (callback: QueryCallback<void>) => {
    if (statusColumnReady) {
        callback();
        return;
    }

    pool.query("ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'Active'", () => {
        statusColumnReady = true;
        callback();
    });
};

const getUserById = (uid: string, callback: QueryCallback<UserRow[]>) => {
    ensureStatusColumn((err: Error | null) => {
        if (err) return callback(err);
        pool.query("SELECT * FROM users WHERE id = ?", [uid], callback);
    });
};

const getAllUsers = (callback: QueryCallback<UserRow[]>) => {
    ensureStatusColumn((err: Error | null) => {
        if (err) return callback(err);
        pool.query(
            `SELECT users.*, COUNT(orders.id) AS order_count
            FROM users
            LEFT JOIN orders ON orders.user_id = users.id
            GROUP BY users.id
            ORDER BY users.created_at DESC`,
            callback
        );
    });
};

const getAllUsersPaginated = (limit: number, offset: number, callback: QueryCallback<UserRow[]>) => {
    ensureStatusColumn((err: Error | null) => {
        if (err) return callback(err);
        pool.query(
            `SELECT users.*, COUNT(orders.id) AS order_count
            FROM users
            LEFT JOIN orders ON orders.user_id = users.id
            GROUP BY users.id
            ORDER BY users.created_at DESC
            LIMIT ? OFFSET ?`,
            [limit, offset],
            callback
        );
    });
};

const getUsersCount = (callback: QueryCallback<CountRow[]>) => {
    pool.query("SELECT COUNT(*) AS total FROM users", callback);
};

const getCustomerProfile = (uid: string, callback: QueryCallback<CustomerProfileRow[]>) => {
    ensureStatusColumn((err: Error | null) => {
        if (err) return callback(err);
        pool.query(
            `SELECT
                u.id,
                u.username,
                u.email,
                u.first_name,
                u.last_name,
                u.role,
                u.status,
                u.created_at,
                COUNT(DISTINCT o.id) AS order_count,
                COALESCE(SUM(CASE WHEN o.status = 1 THEN o.total_price - o.discount ELSE 0 END), 0) AS total_spent,
                MAX(o.date_added) AS last_order_at,
                COUNT(DISTINCT w.id) AS wishlist_count
            FROM users u
            LEFT JOIN orders o ON o.user_id = u.id
            LEFT JOIN wishlist w ON w.user_id = u.id
            WHERE u.id = ?
            GROUP BY u.id`,
            [uid],
            callback
        );
    });
};

const getCustomerRecentOrders = (uid: string, callback: QueryCallback<CustomerRecentOrderRow[]>) => {
    pool.query(
        `SELECT
            id,
            DATE_FORMAT(date_added, '%Y-%m-%dT%H:%i:%s.000Z') AS date_added,
            status,
            total_price,
            discount,
            payment_method
        FROM orders
        WHERE user_id = ?
        ORDER BY date_added DESC
        LIMIT 8`,
        [uid],
        callback
    );
};

const createUser = (uid: string, username: string, email: string, password: string, role: string, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        "INSERT INTO users (id, username, email, password, role, token) VALUES (?, ?, ?, ?, ?, '')",
        [uid, username, email, password, role],
        callback
    );
};

const updateUserToken = (uid: string, token: string, callback: QueryCallback<UpdateResult>) => {
    pool.query(
        "UPDATE users SET token = ?, last_login=CURRENT_TIMESTAMP WHERE id = ?",
        [token, uid],
        callback
    );
};

const updateUserAdmin = (uid: string, role: string, status: string, callback: QueryCallback<UpdateResult>) => {
    ensureStatusColumn((err: Error | null) => {
        if (err) return callback(err);
        pool.query(
            "UPDATE users SET role = ?, status = ? WHERE id = ?",
            [role, status, uid],
            (updateErr: DbError | null, result: UpdateResult) => {
                if (updateErr && updateErr.code === "ER_BAD_FIELD_ERROR") {
                    return pool.query("UPDATE users SET role = ? WHERE id = ?", [role, uid], callback);
                }
                return callback(updateErr, result);
            }
        );
    });
};

module.exports = {
    getUserById,
    getAllUsers,
    getAllUsersPaginated,
    getUsersCount,
    getCustomerProfile,
    getCustomerRecentOrders,
    createUser,
    updateUserToken,
    updateUserAdmin,
};
