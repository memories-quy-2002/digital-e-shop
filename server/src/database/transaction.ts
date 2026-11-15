import pool from "#src/config/database.config";
import { logger } from "#src/shared/utils/logger";

const QUERY_TIMEOUT = 8000;
const MAX_TRANSACTION_ATTEMPTS = 5;

export type TransactionRetryOptions = {
    maxAttempts?: number;
    baseDelayMs?: number;
};

const isRetryableConcurrencyError = (error: unknown): boolean => {
    if (!error || typeof error !== "object") return false;
    const { code, errno } = error as { code?: unknown; errno?: unknown };
    return code === "ER_LOCK_DEADLOCK" || code === "ER_LOCK_WAIT_TIMEOUT" || errno === 1213 || errno === 1205;
};

type QueryCallback = (error: Error | null, results?: unknown) => void;

type TransactionConnection = {
    query: (sql: { sql: string; timeout: number }, values: unknown[], callback: QueryCallback) => unknown;
    beginTransaction: (callback: (error?: Error | null) => void) => void;
    commit: (callback: (error?: Error | null) => void) => void;
    rollback: (callback: (error?: Error | null) => void) => void;
    release: () => void;
};

type TransactionPool = {
    getConnection: (callback: (error: Error | null, connection: TransactionConnection) => void) => void;
};

export type TransactionContext = {
    query<T = unknown>(sql: string, values?: unknown[]): Promise<T>;
};

const getConnection = () => new Promise<TransactionConnection>((resolve, reject) => {
    (pool as unknown as TransactionPool).getConnection((error, connection) => {
        if (error) return reject(error);
        resolve(connection);
    });
});

const run = <T>(callback: (done: (error?: Error | null, value?: T) => void) => void) =>
    new Promise<T>((resolve, reject) => {
        callback((error, value) => error ? reject(error) : resolve(value as T));
    });

const createTransactionContext = (connection: TransactionConnection): TransactionContext => ({
    query<T = unknown>(sql: string, values: unknown[] = []) {
        const startedAt = process.hrtime.bigint();
        return run<T>((done) => {
            connection.query({ sql, timeout: QUERY_TIMEOUT }, values, (error, results) => done(error, results as T));
        }).finally(() => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
            if (process.env.DB_QUERY_LOG === "true" && durationMs >= Number(process.env.DB_QUERY_LOG_THRESHOLD_MS || 200)) {
                // Never log bound parameter values: queries may contain customer or payment data.
                logger.info({ durationMs, sql: sql.replace(/\s+/g, " ").trim() }, "[db] transaction query");
            }
        });
    },
});

export async function withTransaction<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    const connection = await getConnection();
    try {
        await run<void>((done) => connection.beginTransaction(done));
        const result = await work(createTransactionContext(connection));
        await run<void>((done) => connection.commit(done));
        return result;
    } catch (error) {
        try {
            await run<void>((done) => connection.rollback(done));
        } catch (rollbackError) {
            logger.error({ rollbackError }, "Transaction rollback failed");
            // A failed rollback leaves the transaction state uncertain; never auto-retry.
            throw new AggregateError([error, rollbackError], "Transaction failed and rollback was not confirmed");
        }
        throw error;
    } finally {
        connection.release();
    }
}


/**
 * Retry an entirely database-local, repeatable transaction after InnoDB deadlocks
 * or lock-wait timeouts. All callbacks must be safe to execute more than once:
 * no network calls, messages, notifications or other irreversible side effects.
 *
 * Never retry after the callback has completed: COMMIT may have succeeded even
 * if its response was lost. Provider operations and checkout finalization should
 * retain their explicit idempotency and reconciliation mechanisms instead.
 */
export async function withRetryableTransaction<T>(
    work: (tx: TransactionContext) => Promise<T>,
    { maxAttempts = 3, baseDelayMs = 20 }: TransactionRetryOptions = {},
): Promise<T> {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > MAX_TRANSACTION_ATTEMPTS) {
        throw new RangeError("maxAttempts must be an integer from 1 to 5");
    }
    if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0 || baseDelayMs > 1000) {
        throw new RangeError("baseDelayMs must be between 0 and 1000");
    }

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let commitMayHaveStarted = false;
        try {
            return await withTransaction(async (tx) => {
                const result = await work(tx);
                commitMayHaveStarted = true;
                return result;
            });
        } catch (error) {
            if (commitMayHaveStarted || !isRetryableConcurrencyError(error) || attempt === maxAttempts) {
                throw error;
            }
            const delay = baseDelayMs * (2 ** (attempt - 1));
            const jitter = baseDelayMs === 0 ? 0 : Math.floor(Math.random() * baseDelayMs);
            await new Promise<void>((resolve) => setTimeout(resolve, delay + jitter));
        }
    }
    // The loop always returns or throws; this satisfies TypeScript's return analysis.
    throw new Error("Transaction retry attempts exhausted");
}
