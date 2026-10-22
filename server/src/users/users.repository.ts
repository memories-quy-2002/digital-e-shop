import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import { withTransaction } from "../database/transaction";
import type { CountRow, DbError, QueryCallback, UpdateResult } from "#src/shared/interfaces/database";
import type { CustomerProfileRow, CustomerRecentOrderRow, UserRow } from "./users.types";
import type { TransactionContext } from "../database/transaction";
import { ORDER_STATUS } from "#src/shared/constants/order-status";
import { USER_RECENT_ORDERS_LIMIT } from "#src/shared/constants/operational-limits";

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

    findByProviderUserId(providerUserId: string): Promise<UserRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                "SELECT * FROM users WHERE auth_provider = 'firebase' AND provider_user_id = ? LIMIT 1",
                [providerUserId],
                (queryErr: DbError | null, results?: UserRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(results?.[0] || null);
                },
            );
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
                 LEFT JOIN orders ON orders.user_id = users.id AND orders.status <> ${ORDER_STATUS.CANCELED}
                 GROUP BY users.id
                 ORDER BY users.created_at DESC`,
                (queryErr: DbError | null, results?: UserRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(results || []);
                },
            );
        });
    }

    getActiveDeliveryStaff(): Promise<Array<{ id: string; name: string }>> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT id, first_name, last_name, username FROM users
                 WHERE role = 'DeliveryStaff' AND status = 'Active'
                 ORDER BY first_name, last_name, username`,
                (queryErr: DbError | null, results?: Array<{ id: string; first_name?: string | null; last_name?: string | null; username?: string }>) => {
                    if (queryErr) return reject(queryErr);
                    resolve((results || []).map((user) => ({
                        id: user.id,
                        name: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Delivery staff",
                    })));
                },
            );
        });
    }

    getAdminPaginated(
        limit: number,
        offset: number,
        filters: { search?: string; role?: string; status?: string },
    ): Promise<UserRow[]> {
        const { where, params } = getAdminUserWhere(filters);
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT users.*, COUNT(orders.id) AS order_count
                 FROM users
                 LEFT JOIN orders ON orders.user_id = users.id AND orders.status <> ${ORDER_STATUS.CANCELED}
                 ${where}
                 GROUP BY users.id
                 ORDER BY users.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset],
                (queryErr: DbError | null, results?: UserRow[]) => {
                    if (queryErr) return reject(queryErr);
                    resolve(results || []);
                },
            );
        });
    }

    getAdminCount(filters: { search?: string; role?: string; status?: string }): Promise<number> {
        const { where, params } = getAdminUserWhere(filters);
        return new Promise((resolve, reject) => {
            pool.query(`SELECT COUNT(*) AS total FROM users ${where}`, params, (err: DbError | null, results?: CountRow[]) => {
                if (err) return reject(err);
                resolve(results?.[0]?.total || 0);
            });
        });
    }

    getAdminSummary(): Promise<{ total: number; customers: number; suspended: number }> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT COUNT(*) AS total,
                    SUM(CASE WHEN role = 'Customer' THEN 1 ELSE 0 END) AS customers,
                    SUM(CASE WHEN status = 'Suspended' THEN 1 ELSE 0 END) AS suspended
                 FROM users`,
                (err: DbError | null, rows?: Array<{ total: number; customers: number; suspended: number }>) => {
                    if (err) return reject(err);
                    const row = rows?.[0];
                    resolve({ total: Number(row?.total) || 0, customers: Number(row?.customers) || 0, suspended: Number(row?.suspended) || 0 });
                },
            );
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
                    COALESCE(SUM(CASE WHEN o.status = ${ORDER_STATUS.DONE} THEN o.total_price - o.discount ELSE 0 END), 0) AS total_spent,
                    MAX(o.date_added) AS last_order_at,
                    COUNT(DISTINCT w.id) AS wishlist_count
                FROM users u
                LEFT JOIN orders o ON o.user_id = u.id AND o.status <> ${ORDER_STATUS.CANCELED}
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
                LIMIT ${USER_RECENT_ORDERS_LIMIT}`,
                [uid],
                (err: DbError | null, results?: CustomerRecentOrderRow[]) => {
                    if (err) return reject(err);
                    resolve(results || []);
                },
            );
        });
    }

    async createRegisteredFirebaseUserInTransaction(tx: TransactionContext, input: { uid: string; username: string; email: string; password: string; emailVerified: boolean; firstName: string | null; lastName: string | null }): Promise<UserRow | null> {
        await tx.query(
            "INSERT INTO users (id, username, email, password, first_name, last_name, role, token) VALUES (?, ?, ?, ?, ?, ?, 'Customer', '')",
            [input.uid, input.username, input.email, input.password, input.firstName, input.lastName],
        );
        await tx.query("UPDATE users SET auth_provider = 'firebase', provider_user_id = ? WHERE id = ?", [input.uid, input.uid]);
        if (input.emailVerified) {
            await tx.query("UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?", [input.uid]);
        }
        const [user] = await tx.query<UserRow[]>("SELECT * FROM users WHERE id = ?", [input.uid]);
        return user || null;
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

    linkFirebaseIdentity(userId: string, email: string, providerUserId: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET auth_provider = 'firebase',
                     provider_user_id = ?
                 WHERE id = ?
                   AND LOWER(email) = LOWER(?)
                   AND COALESCE(auth_provider, '') IN ('', 'local')
                   AND COALESCE(provider_user_id, '') = ''`,
                [providerUserId, userId, email],
                (queryErr: DbError | null, result?: UpdateResult) => {
                    if (queryErr) return reject(queryErr);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    rebindFirebaseIdentity(
        userId: string,
        email: string,
        expectedProviderUserId: string,
        nextProviderUserId: string,
    ): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET provider_user_id = ?
                 WHERE id = ?
                   AND LOWER(email) = LOWER(?)
                   AND auth_provider = 'firebase'
                   AND provider_user_id = ?`,
                [nextProviderUserId, userId, email, expectedProviderUserId],
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

    syncFirebaseEmail(uid: string, email: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE users
                 SET email = ?,
                     email_verified_at = UTC_TIMESTAMP(),
                     email_verification_token_hash = NULL,
                     email_verification_expires_at = NULL,
                     pending_email = NULL,
                     email_change_token_hash = NULL,
                     email_change_expires_at = NULL
                 WHERE id = ?
                   AND auth_provider = 'firebase'
                   AND provider_user_id = ?`,
                [email, uid, uid],
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

    updateUserAdmin(uid: string, role: string, status: string, currentAdminId: string, reason: string): Promise<UpdateResult> {
        return withTransaction(async (tx) => {
            const [target] = await tx.query<Array<{ id: string; role: string; status: string }>>(
                "SELECT id, role, status FROM users WHERE id = ? FOR UPDATE",
                [uid],
            );
            if (!target) return { affectedRows: 0 };

            const demotesTarget = target.role === "Admin" && target.status === "Active"
                && (role !== "Admin" || status !== "Active");
            if (String(target.id) === currentAdminId && demotesTarget) {
                throw Object.assign(new Error("You cannot remove your own active administrator access."), { statusCode: 409 });
            }

            if (demotesTarget) {
                const activeAdmins = await tx.query<Array<{ id: string }>>(
                    "SELECT id FROM users WHERE role = 'Admin' AND status = 'Active' ORDER BY id FOR UPDATE",
                );
                if (activeAdmins.length <= 1) {
                    throw Object.assign(new Error("The last active administrator cannot be demoted or suspended."), { statusCode: 409 });
                }
            }

            const result = await tx.query<UpdateResult>(
                "UPDATE users SET role = ?, status = ? WHERE id = ?",
                [role, status, uid],
            );
            if (target.role !== role || target.status !== status) {
                await tx.query(
                    `INSERT INTO admin_audit_events (actor_id, action, entity_type, entity_id, reason, changes)
                     VALUES (?, 'user.access.updated', 'user', ?, ?, ?)` ,
                    [currentAdminId, uid, reason, JSON.stringify({ before: { role: target.role, status: target.status }, after: { role, status } })],
                );
            }
            return { ...result, affectedRows: result.affectedRows || 1 };
        });
    }
}

const getAdminUserWhere = (filters: { search?: string; role?: string; status?: string }) => {
    const conditions: string[] = [];
    const params: string[] = [];
    const search = filters.search?.trim().toLowerCase();
    if (search) {
        const term = `%${search.replace(/[!%_]/g, "!$&")}%`;
        conditions.push(`(LOWER(users.id) LIKE ? ESCAPE '!' OR LOWER(users.username) LIKE ? ESCAPE '!' OR LOWER(users.email) LIKE ? ESCAPE '!' OR LOWER(users.role) LIKE ? ESCAPE '!' OR LOWER(users.status) LIKE ? ESCAPE '!')`);
        params.push(term, term, term, term, term);
    }
    if (filters.role) {
        conditions.push("users.role = ?");
        params.push(filters.role);
    }
    if (filters.status) {
        conditions.push("users.status = ?");
        params.push(filters.status);
    }
    return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", params };
};
