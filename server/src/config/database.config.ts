import mysql from "mysql";
import { env } from "#src/config/env.config";
import { logger } from "#src/shared/utils/logger";

type QueryCallback = (err: Error | null, results?: unknown, fields?: unknown) => void;
type QueryInput = string | { sql: string; timeout?: number };
type QueryParams = unknown[] | Record<string, unknown> | undefined;
type QueryResult = { on: (event: string, callback: () => void) => void };
type DbConnection = { release: () => void };
type DbPool = {
    query: (sql: QueryInput, values?: QueryParams | QueryCallback, callback?: QueryCallback) => QueryResult | unknown;
    getConnection: (callback: (err: Error | null, connection: DbConnection) => void) => void;
};

if (!env.dbHost || !env.dbUser || !env.dbName) {
    logger.warn("Database environment variables are missing. Check your .env file.");
}

const pool = mysql.createPool({
    host: env.dbHost,
    user: env.dbUser,
    password: env.dbPassword,
    database: env.dbName,
    port: env.dbPort,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
    acquireTimeout: 10000,
}) as DbPool;

const originalQuery = pool.query.bind(pool);

const normalizeSql = (sqlText: unknown) => String(sqlText || "").replace(/\s+/g, " ").trim().replace(/;$/, "");
const isSelectQuery = (sqlText: unknown) => /^\s*select/i.test(String(sqlText || ""));

pool.query = (sql: QueryInput, values?: QueryParams | QueryCallback, callback?: QueryCallback) => {
    const start = process.hrtime.bigint();
    let params = values as QueryParams;
    let cb = callback;

    if (typeof values === "function") {
        cb = values;
        params = undefined;
    }

    const logIfNeeded = () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const sqlText = typeof sql === "object" ? sql.sql : String(sql);
        const compactSql = normalizeSql(sqlText);

        if (env.dbQueryLog && durationMs >= env.dbQueryLogThresholdMs) {
            logger.info(`[db] ${durationMs.toFixed(1)} ms | ${compactSql}`);
        }

        if (
            env.dbExplainSlow &&
            durationMs >= env.dbQueryLogThresholdMs &&
            isSelectQuery(sqlText) &&
            !/^\s*explain/i.test(sqlText || "")
        ) {
            const explainSql = `EXPLAIN ANALYZE ${compactSql}`;
            originalQuery(explainSql, params || [], (explainErr: Error | null, rows: unknown) => {
                if (explainErr) {
                    logger.warn(`[db] EXPLAIN failed: ${explainErr.message}`);
                    return;
                }

                logger.info({ sql: compactSql, rows }, "[db] EXPLAIN");
            });
        }
    };

    if (typeof cb === "function") {
        return originalQuery(sql, params, (err: Error | null, results: unknown, fields: unknown) => {
            logIfNeeded();
            return cb?.(err, results, fields);
        });
    }

    const result = originalQuery(sql, params) as QueryResult;
    result.on("end", logIfNeeded);
    return result;
};

pool.getConnection((err: Error | null, connection: DbConnection) => {
    if (err) {
        logger.error("Error connecting to MySQL database:", err);
        return;
    }

    logger.info("Connected to MySQL database!");
    connection.release();
});

export default pool;

