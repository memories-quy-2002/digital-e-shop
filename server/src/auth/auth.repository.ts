import { Injectable } from "@nestjs/common";
import pool from "#src/config/database.config";
import type { DbError, InsertResult, UpdateResult } from "#src/shared/interfaces/database";
import type { SessionRow } from "./auth.types";

@Injectable()
export class AuthRepository {
    startSession(userId: string, refreshTokenHash: string | null = null, refreshExpiresAt: Date | null = null): Promise<number> {
        const sessionStart = new Date();
        return new Promise((resolve, reject) => {
            pool.query(
                "INSERT INTO customer_sessions (user_id, session_start, refresh_token_hash, refresh_expires_at) VALUES (?, ?, ?, ?)",
                [userId, sessionStart, refreshTokenHash, refreshExpiresAt],
                (err: DbError | null, result?: InsertResult) => {
                    if (err) return reject(err);
                    resolve(result?.insertId || 0);
                },
            );
        });
    }

    getSessionById(sessionId: number | string): Promise<SessionRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                "SELECT id, user_id, session_start, session_end, refresh_token_hash, refresh_expires_at, revoked_at, last_used_at FROM customer_sessions WHERE id = ?",
                [sessionId],
                (err: DbError | null, results?: SessionRow[]) => {
                    if (err) return reject(err);
                    resolve(results && results.length > 0 ? results[0] : null);
                },
            );
        });
    }

    getActiveSessionById(sessionId: number | string): Promise<SessionRow | null> {
        return new Promise((resolve, reject) => {
            pool.query(
                `SELECT id, user_id, session_start, session_end, refresh_token_hash, refresh_expires_at, revoked_at, last_used_at
                 FROM customer_sessions
                 WHERE id = ?
                   AND revoked_at IS NULL
                   AND session_end IS NULL
                   AND refresh_token_hash IS NOT NULL
                   AND refresh_expires_at > UTC_TIMESTAMP()
                 LIMIT 1`,
                [parseInt(String(sessionId), 10)],
                (err: DbError | null, results?: SessionRow[]) => {
                    if (err) return reject(err);
                    resolve(results && results.length > 0 ? results[0] : null);
                },
            );
        });
    }

    rotateRefreshToken(sessionId: number, expectedHash: string, nextHash: string, nextExpiry: Date): Promise<boolean> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE customer_sessions
                 SET refresh_token_hash = ?, refresh_expires_at = ?, last_used_at = UTC_TIMESTAMP()
                 WHERE id = ?
                   AND refresh_token_hash = ?
                   AND revoked_at IS NULL
                   AND session_end IS NULL
                   AND refresh_expires_at > UTC_TIMESTAMP()`,
                [nextHash, nextExpiry, sessionId, expectedHash],
                (err: DbError | null, result?: UpdateResult) => {
                    if (err) return reject(err);
                    resolve((result?.affectedRows || 0) === 1);
                },
            );
        });
    }

    revokeSession(sessionId: number | string): Promise<void> {
        return new Promise((resolve, reject) => {
            pool.query(
                "UPDATE customer_sessions SET revoked_at = UTC_TIMESTAMP(), session_end = COALESCE(session_end, UTC_TIMESTAMP()) WHERE id = ? AND revoked_at IS NULL",
                [parseInt(String(sessionId), 10)],
                (err: DbError | null) => {
                    if (err) return reject(err);
                    resolve();
                },
            );
        });
    }

    updateSession(sessionId: number | string, sessionEnd: Date): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                "UPDATE customer_sessions SET session_end = ? WHERE id = ?",
                [sessionEnd, parseInt(String(sessionId), 10)],
                (err: DbError | null, result?: UpdateResult) => {
                    if (err) return reject(err);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }

    revokeAllSessions(userId: string): Promise<UpdateResult> {
        return new Promise((resolve, reject) => {
            pool.query(
                `UPDATE customer_sessions
                 SET revoked_at = UTC_TIMESTAMP(),
                     session_end = COALESCE(session_end, UTC_TIMESTAMP())
                 WHERE user_id = ?
                   AND revoked_at IS NULL`,
                [userId],
                (err: DbError | null, result?: UpdateResult) => {
                    if (err) return reject(err);
                    resolve(result || { affectedRows: 0 });
                },
            );
        });
    }
}
