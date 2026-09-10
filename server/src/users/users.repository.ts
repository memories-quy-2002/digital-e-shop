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

    findByUsername(username: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER(?) LIMIT 1", [username], (queryErr: DbError | null, results?: UserRow[]) => {
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

    createLocalUser(uid: string, username: string, email: string, password: string, role = "Customer"): Promise<void> {
        return new Promise((resolve, reject) => {
            pool.query(
                "INSERT INTO users (id, username, email, password, role, token, auth_provider, provider_user_id) VALUES (?, ?, ?, ?, ?, '', 'local', NULL)",
                [uid, username, email, password, role],
                (queryErr: DbError | null) => {
                    if (queryErr) return reject(queryErr);
                    resolve();
                },
            );
        });
    }

    updateAuthIdentity(uid: string, provider: string, providerUserId: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                "UPDATE users SET auth_provider = ?, provider_user_id = ? WHERE id = ?",
                [provider, providerUserId, uid],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    markEmailVerified(uid: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()),
                     email_verification_token_hash = NULL,
                     email_verification_expires_at = NULL
                 WHERE id = ?`,
                [uid],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    setEmailVerificationToken(uid: string, tokenHash: string, expiresAt: Date): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET email_verification_token_hash = ?,
                     email_verification_expires_at = ?,
                     email_verification_sent_at = UTC_TIMESTAMP()
                 WHERE id = ? AND email_verified_at IS NULL`,
                [tokenHash, expiresAt, uid],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    findByVerificationTokenHash(tokenHash: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT * FROM users
                 WHERE email_verification_token_hash = ?
                   AND email_verification_expires_at > UTC_TIMESTAMP()
                   AND email_verified_at IS NULL
                 LIMIT 1`,
                [tokenHash],
                (queryErr: DbError | null, results?: UserRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(results?.[0] || null);
                },
            );
        });
    }

    consumeEmailVerificationToken(uid: string, tokenHash: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET email_verified_at = UTC_TIMESTAMP(),
                     email_verification_token_hash = NULL,
                     email_verification_expires_at = NULL
                 WHERE id = ?
                   AND email_verification_token_hash = ?
                   AND email_verification_expires_at > UTC_TIMESTAMP()
                   AND email_verified_at IS NULL`,
                [uid, tokenHash],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    setPasswordResetToken(uid: string, tokenHash: string, expiresAt: Date): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET password_reset_token_hash = ?,
                     password_reset_expires_at = ?
                 WHERE id = ?`,
                [tokenHash, expiresAt, uid],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    findByPasswordResetTokenHash(tokenHash: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT * FROM users
                 WHERE password_reset_token_hash = ?
                   AND password_reset_expires_at > UTC_TIMESTAMP()
                 LIMIT 1`,
                [tokenHash],
                (queryErr: DbError | null, results?: UserRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(results?.[0] || null);
                },
            );
        });
    }

    consumePasswordResetToken(uid: string, tokenHash: string, passwordHash: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET password = ?,
                     password_reset_token_hash = NULL,
                     password_reset_expires_at = NULL
                 WHERE id = ?
                   AND password_reset_token_hash = ?
                   AND password_reset_expires_at > UTC_TIMESTAMP()`,
                [passwordHash, uid, tokenHash],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    setPendingEmailChange(uid: string, email: string, tokenHash: string, expiresAt: Date): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET pending_email = ?,
                     email_change_token_hash = ?,
                     email_change_expires_at = ?
                 WHERE id = ?`,
                [email, tokenHash, expiresAt, uid],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    findByEmailChangeTokenHash(tokenHash: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT * FROM users
                 WHERE email_change_token_hash = ?
                   AND email_change_expires_at > UTC_TIMESTAMP()
                   AND pending_email IS NOT NULL
                 LIMIT 1`,
                [tokenHash],
                (queryErr: DbError | null, results?: UserRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(results?.[0] || null);
                },
            );
        });
    }

    consumeEmailChangeToken(uid: string, tokenHash: string, email: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET email = ?,
                     email_verified_at = UTC_TIMESTAMP(),
                     pending_email = NULL,
                     email_change_token_hash = NULL,
                     email_change_expires_at = NULL
                 WHERE id = ?
                   AND pending_email = ?
                   AND email_change_token_hash = ?
                   AND email_change_expires_at > UTC_TIMESTAMP()`,
                [email, uid, email, tokenHash],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
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
