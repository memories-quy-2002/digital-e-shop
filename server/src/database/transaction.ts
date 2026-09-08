import pool from "#src/config/database.config";
import { logger } from "#src/shared/utils/logger";

const QUERY_TIMEOUT = 8000;

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
        return run<T>((done) => {
            connection.query({ sql, timeout: QUERY_TIMEOUT }, values, (error, results) => done(error, results as T));
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
        await run<void>((done) => connection.rollback(done)).catch((rollbackError) => {
            logger.error({ rollbackError }, "Transaction rollback failed");
        });
        throw error;
    } finally {
        connection.release();
    }
}
