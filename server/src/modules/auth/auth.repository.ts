import pool from "#/config/database.config";
import type { DbError, InsertResult, UpdateResult } from "#/shared/interfaces/database";
import type { SessionRow } from "./auth.types";

class AuthRepository {
    startSession(userId: string): Promise<number> {
        const sessionStart = new Date();
        return new Promise((resolve, reject) => {
            pool.query(
                "INSERT INTO customer_sessions (user_id, session_start) VALUES (?, ?)",
                [userId, sessionStart],
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
                "SELECT session_start FROM customer_sessions WHERE id = ?",
                [sessionId],
                (err: DbError | null, results?: SessionRow[]) => {
                    if (err) return reject(err);
                    resolve(results && results.length > 0 ? results[0] : null);
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
}

export const authRepository = new AuthRepository();
