import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { CountRow, DbError, QueryCallback, UpdateResult } from "#src/shared/interfaces/database";
import type { CustomerProfileRow, CustomerRecentOrderRow, UserRow } from "./users.types";

/** Compatibility hook for legacy imports; schema changes are migration-owned. */
export const ensureUserAuthColumns = (callback: QueryCallback<void>) => callback();

@Injectable()
export class UsersRepository {
    findById(uid: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            pool.query("SELECT * FROM users WHERE id = ?", [uid], (queryErr: DbError | null, results?: UserRow[]) => {
                if (queryErr) return reject(queryErr);
                resolve(results?.[0] || null);
            });
        });
    }

    findByEmail(email: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            pool.query("SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1", [email], (queryErr: DbError | null, results?: UserRow[]) => {
                if (queryErr) return reject(queryErr);
                resolve(results?.[0] || null);
            });
        });
    }

    getAll(): Promise<UserRow[]> {
        return new Promise((resolve, reject) => {
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
    }

    getPaginated(limit: number, offset: number): Promise<UserRow[]> {
        return new Promise((resolve, reject) => {
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
                    resolve(results?.[0] || null);
                },
            );
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
            pool.query(
                "INSERT INTO users (id, username, email, password, role, token) VALUES (?, ?, ?, ?, ?, '')",
                [uid, username, email, password, role],
                (queryErr: DbError | null) => {
                    if (queryErr) return reject(queryErr);
                    resolve();
                },
            );
        });
    }

    updateUserToken(uid: string, token: string): Promise<void> {
        return new Promise((resolve, reject) => {
            pool.query(
                "UPDATE users SET token = ?, last_login = CURRENT_TIMESTAMP WHERE id = ?",
                [token, uid],
                (queryErr: DbError | null) => {
                    if (queryErr) return reject(queryErr);
                    resolve();
                },
            );
        });
    }

    updateUserAdmin(uid: string, role: string, status: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                "UPDATE users SET role = ?, status = ? WHERE id = ?",
                [role, status, uid],
                (updateErr: DbError | null, result?: UpdateResult) => {
                    if (updateErr) return reject(updateErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }
}
