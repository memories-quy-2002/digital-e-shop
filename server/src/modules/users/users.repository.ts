import pool from "#/config/database.config";
import type { CountRow, DbError, QueryCallback, UpdateResult } from "#/shared/interfaces/database";
import type { CustomerProfileRow, CustomerRecentOrderRow, UserRow } from "./users.types";

let statusColumnReady = false;
let socialAuthColumnsReady = false;
let tokenColumnReady = false;

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

const addUserColumnIfMissing = (sql: string, callback: QueryCallback<void>) => {
    pool.query(sql, (err?: DbError | null) => {
        if (err && err.code !== "ER_DUP_FIELDNAME") {
            callback(err);
            return;
        }

        callback();
    });
};

const ensureSocialAuthColumns = (callback: QueryCallback<void>) => {
    if (socialAuthColumnsReady) {
        callback();
        return;
    }

    addUserColumnIfMissing("ALTER TABLE users ADD COLUMN auth_provider VARCHAR(32) NULL", (authProviderErr?: DbError | null) => {
        if (authProviderErr) return callback(authProviderErr);

        addUserColumnIfMissing("ALTER TABLE users ADD COLUMN provider_user_id VARCHAR(255) NULL", (providerIdErr?: DbError | null) => {
            if (providerIdErr) return callback(providerIdErr);

            socialAuthColumnsReady = true;
            callback();
        });
    });
};

const ensureTokenColumnCapacity = (callback: QueryCallback<void>) => {
    if (tokenColumnReady) {
        callback();
        return;
    }

    pool.query("ALTER TABLE users MODIFY COLUMN token TEXT NOT NULL", (err?: DbError | null) => {
        if (err && err.code !== "ER_BAD_FIELD_ERROR") {
            callback(err);
            return;
        }

        tokenColumnReady = true;
        callback();
    });
};

export const ensureUserAuthColumns = (callback: QueryCallback<void>) => {
    ensureStatusColumn((statusErr?: DbError | null) => {
        if (statusErr) return callback(statusErr);
        ensureSocialAuthColumns((socialAuthErr?: DbError | null) => {
            if (socialAuthErr) return callback(socialAuthErr);
            ensureTokenColumnCapacity(callback);
        });
    });
};

class UsersRepository {
    findById(uid: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query("SELECT * FROM users WHERE id = ?", [uid], (queryErr: DbError | null, results?: UserRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(results && results.length > 0 ? results[0] : null);
                });
            });
        });
    }

    findByEmail(email: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1", [email], (queryErr: DbError | null, results?: UserRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(results && results.length > 0 ? results[0] : null);
                });
            });
        });
    }

    findBySocialProvider(provider: string, providerUserId: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query(
                    "SELECT * FROM users WHERE auth_provider = ? AND provider_user_id = ? LIMIT 1",
                    [provider, providerUserId],
                    (queryErr: DbError | null, results?: UserRow[]) => {
                        if (queryErr) return reject(queryErr);
                        resolve(results && results.length > 0 ? results[0] : null);
                    },
                );
            });
        });
    }

    getAll(): Promise<UserRow[]> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query(
                    `SELECT users.*, COUNT(orders.id) AS order_count
                     FROM users
                     LEFT JOIN orders ON orders.user_id = users.id
                     GROUP BY users.id
                     ORDER BY users.created_at DESC`,
                    (queryErr: DbError | null, results?: UserRow[]) => {
                        if (queryErr) return reject(queryErr);
                        resolve(results || []);
                    },
                );
            });
        });
    }

    getPaginated(limit: number, offset: number): Promise<UserRow[]> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query(
                    `SELECT users.*, COUNT(orders.id) AS order_count
                     FROM users
                     LEFT JOIN orders ON orders.user_id = users.id
                     GROUP BY users.id
                     ORDER BY users.created_at DESC
                     LIMIT ? OFFSET ?`,
                    [limit, offset],
                    (queryErr: DbError | null, results?: UserRow[]) => {
                        if (queryErr) return reject(queryErr);
                        resolve(results || []);
                    },
                );
            });
        });
    }

    getCount(): Promise<number> {
        return new Promise((resolve, reject) => {
            pool.query("SELECT COUNT(*) AS total FROM users", (err: DbError | null, results?: CountRow[]) => {
                if (err) return reject(err);
                resolve(results?.[0]?.total || 0);
            });
        });
    }

    getCustomerProfile(uid: string): Promise<CustomerProfileRow | null> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
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
                    (queryErr: DbError | null, results?: CustomerProfileRow[]) => {
                        if (queryErr) return reject(queryErr);
                        resolve(results && results.length > 0 ? results[0] : null);
                    },
                );
            });
        });
    }

    getCustomerRecentOrders(uid: string): Promise<CustomerRecentOrderRow[]> {
        return new Promise((resolve, reject) => {
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
                (err: DbError | null, results?: CustomerRecentOrderRow[]) => {
                    if (err) return reject(err);
                    resolve(results || []);
                },
            );
        });
    }

    createUser(uid: string, username: string, email: string, password: string, role: string): Promise<void> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query(
                    "INSERT INTO users (id, username, email, password, role, token) VALUES (?, ?, ?, ?, ?, '')",
                    [uid, username, email, password, role],
                    (queryErr: DbError | null) => {
                        if (queryErr) return reject(queryErr);
                        resolve();
                    },
                );
            });
        });
    }

    createSocialUser(
        uid: string,
        username: string,
        email: string,
        password: string,
        role: string,
        provider: string,
        providerUserId: string,
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query(
                    `INSERT INTO users (id, username, email, password, role, token, auth_provider, provider_user_id)
                     VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
                    [uid, username, email, password, role, provider, providerUserId],
                    (queryErr: DbError | null) => {
                        if (queryErr) return reject(queryErr);
                        resolve();
                    },
                );
            });
        });
    }

    updateUserToken(uid: string, token: string): Promise<void> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query(
                    "UPDATE users SET token = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?",
                    [token, uid],
                    (queryErr: DbError | null) => {
                        if (queryErr) return reject(queryErr);
                        resolve();
                    },
                );
            });
        });
    }

    updateUserAdmin(uid: string, role: string, status: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            ensureUserAuthColumns((err: Error | null) => {
                if (err) return reject(err);
                pool.query(
                    "UPDATE users SET role = ?, status = ? WHERE id = ?",
                    [role, status, uid],
                    (updateErr: DbError | null, result?: UpdateResult) => {
                        if (updateErr && updateErr.code === "ER_BAD_FIELD_ERROR") {
                            return pool.query("UPDATE users SET role = ? WHERE id = ?", [role, uid], (fallbackErr: DbError | null, fallbackResult?: UpdateResult) => {
                                if (fallbackErr) return reject(fallbackErr);
                                resolve(fallbackResult || { affectedRows: 0 });
                            });
                        }

                        if (updateErr) return reject(updateErr);
                        resolve(result || { affectedRows: 0 });
                    },
                );
            });
        });
    }
}

export const usersRepository = new UsersRepository();
